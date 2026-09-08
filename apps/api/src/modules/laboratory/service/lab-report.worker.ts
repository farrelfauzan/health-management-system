import { hostname } from 'node:os';

import { LabReportWorkerConfig } from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveLabReportWorkerConfig } from '../lab-report.config';
import { LabReportRepository } from '../repository/lab-report.repository';
import { LabReportService } from './lab-report.service';

/**
 * Interval poller for queued report renders (P18-T05) — the delivery
 * outbox's shape (`P16-T26`), because it is the same problem: work that must
 * not happen on the request that asked for it, on more than one replica,
 * exactly once.
 *
 * Rows are claimed under a lease with `FOR UPDATE SKIP LOCKED`, rendered one
 * after another, and each settles itself: `READY` with a file, or rescheduled
 * with backoff. The batch is small because a render holds the sidecar for a
 * second or two and a burst of releases at the end of a shift should not
 * starve the invoice that is also waiting on it.
 */
@Injectable()
export class LabReportWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LabReportWorker.name);
  private readonly workerConfig: LabReportWorkerConfig;
  private readonly leasedBy = `${hostname()}:${process.pid}`;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    configService: ConfigService,
    private readonly labReportRepository: LabReportRepository,
    private readonly labReportService: LabReportService,
  ) {
    this.workerConfig = resolveLabReportWorkerConfig(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.workerConfig.workerEnabled) {
      this.logger.log('Lab report worker disabled (LAB_REPORT_WORKER_ENABLED=false)');
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.workerConfig.workerPollIntervalMs);
    this.pollTimer.unref();
    this.logger.log(`Lab report worker polling every ${this.workerConfig.workerPollIntervalMs}ms`);
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
      const dueReports = await this.labReportRepository.claimDueReports({
        limit: this.workerConfig.workerBatchSize,
        leaseMs: this.workerConfig.leaseMs,
        leasedBy: this.leasedBy,
      });
      for (const report of dueReports) {
        await this.labReportService.renderClaimedReport(report);
      }
      return dueReports.length;
    } catch {
      this.logger.error(buildSafeErrorLog('lab_report_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
