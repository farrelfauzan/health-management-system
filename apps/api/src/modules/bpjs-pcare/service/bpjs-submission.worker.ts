import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveBpjsPcareAdapterConfig } from '../../../common/bpjs-pcare/bpjs-pcare.config';
import { BpjsPcareAdapterConfig } from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { BpjsSubmissionRepository } from '../repository/bpjs-submission.repository';
import { BpjsSubmissionService } from './bpjs-submission.service';

const POLL_BATCH_LIMIT = 5;

/**
 * Polls the BPJS submission outbox, mirroring the SATUSEHAT worker: one
 * in-process poller (overlapping cycles are skipped, not queued), rows
 * processed sequentially, per-row errors swallowed by the service so one
 * failed submission never stalls the batch. Gated only by
 * BPJS_WORKER_ENABLED — unlike SATUSEHAT there are no env credentials to
 * check at bootstrap, because credentials are database rows and the enqueue
 * hooks already skip visits when bridging is not configured.
 *
 * Safe to run on more than one instance: rows are claimed under a lease with
 * `FOR UPDATE SKIP LOCKED` rather than merely read, so two replicas polling at
 * the same instant divide the queue instead of both reporting the same visit
 * to BPJS (SJ-76). `isPolling` remains a per-process guard against overlapping
 * cycles; it is not what makes concurrency safe.
 */
@Injectable()
export class BpjsSubmissionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BpjsSubmissionWorker.name);
  private readonly adapterConfig: BpjsPcareAdapterConfig;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  constructor(
    private readonly submissionRepository: BpjsSubmissionRepository,
    private readonly submissionService: BpjsSubmissionService,
    configService: ConfigService,
  ) {
    this.adapterConfig = resolveBpjsPcareAdapterConfig(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.adapterConfig.workerEnabled) {
      this.logger.log('BPJS submission worker disabled (BPJS_WORKER_ENABLED=false)');
      return;
    }
    this.pollTimer = setInterval(
      () => void this.pollOnce(),
      this.adapterConfig.workerPollIntervalMs,
    );
    this.pollTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async pollOnce(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }
    this.isPolling = true;
    try {
      const dueSubmissions = await this.submissionRepository.claimDueSubmissions({
        limit: POLL_BATCH_LIMIT,
        leaseMs: this.adapterConfig.submissionLeaseMs,
      });
      for (const submission of dueSubmissions) {
        await this.submissionService.processSubmission(submission);
      }
      return dueSubmissions.length;
    } catch {
      this.logger.error(buildSafeErrorLog('bpjs_submission_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
