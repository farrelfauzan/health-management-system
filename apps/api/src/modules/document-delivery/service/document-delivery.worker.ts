import { hostname } from 'node:os';

import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DocumentDeliveryConfig } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveDocumentDeliveryConfig } from '../document-delivery.config';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliverySendService } from './delivery-send.service';

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Interval poller for the delivery outbox (`P16-T26`, FR-E4-13/17).
 *
 * Safe on more than one replica: rows are claimed under a lease with
 * `FOR UPDATE SKIP LOCKED`, the SATUSEHAT pattern, so a bill is never sent
 * twice. Claimed rows are sent one after another, each through the same
 * pacing chain the conversation replies use — a document waits its turn and
 * its gap like any text, and a reply enqueued while a document is going out
 * follows it directly. The batch is small so a burst of receipts never holds
 * the chain for more than a few sends before replies get back in
 * (FR-E4-17).
 *
 * The daily cap is a rolling 24-hour count of sends and ships unset
 * (§7.4.5.1): when it is reached the sweep claims nothing and says so, and
 * the rows wait — QUEUED, visible on the timeline — until the window moves.
 */
@Injectable()
export class DocumentDeliveryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentDeliveryWorker.name);
  private readonly deliveryConfig: DocumentDeliveryConfig;
  private readonly leasedBy = `${hostname()}:${process.pid}`;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    configService: ConfigService,
    private readonly deliveryRepository: DocumentDeliveryRepository,
    private readonly sendService: DeliverySendService,
  ) {
    this.deliveryConfig = resolveDocumentDeliveryConfig(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.deliveryConfig.workerEnabled) {
      this.logger.log('Document delivery worker disabled (DELIVERY_WORKER_ENABLED=false)');
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.deliveryConfig.workerPollIntervalMs);
    this.pollTimer.unref();
    this.logger.log(
      `Document delivery worker polling every ${this.deliveryConfig.workerPollIntervalMs}ms`,
    );
  }

  onApplicationShutdown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Runs one sweep; overlapping sweeps are skipped, never queued. Returns rows processed. */
  async pollOnce(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }
    this.isPolling = true;
    try {
      const limit = await this.resolveClaimLimit();
      if (limit === 0) {
        return 0;
      }
      const dueDeliveries = await this.deliveryRepository.claimDueDeliveries({
        limit,
        leaseMs: this.deliveryConfig.leaseMs,
        leasedBy: this.leasedBy,
      });
      for (const delivery of dueDeliveries) {
        await this.sendService.processDelivery(delivery);
      }
      return dueDeliveries.length;
    } catch {
      this.logger.error(buildSafeErrorLog('document_delivery_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }

  private async resolveClaimLimit(): Promise<number> {
    const cap = this.deliveryConfig.dailySendCap;
    if (cap === null) {
      return this.deliveryConfig.workerBatchSize;
    }
    const sentToday = await this.deliveryRepository.countSentSince(
      new Date(Date.now() - MILLISECONDS_PER_DAY),
    );
    const headroom = Math.max(0, cap - sentToday);
    if (headroom === 0) {
      this.logger.warn(
        buildSafeErrorLog('document_delivery_daily_cap_reached', { cap, sentToday }),
      );
    }
    return Math.min(this.deliveryConfig.workerBatchSize, headroom);
  }
}
