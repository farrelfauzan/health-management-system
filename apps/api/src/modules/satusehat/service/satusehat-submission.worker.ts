import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionService } from './satusehat-submission.service';

const POLL_BATCH_LIMIT = 5;

/**
 * Interval poller for the SATUSEHAT outbox. Starts only when the adapter is
 * configured and the worker flag is on, so dev, CI, and unconfigured
 * deployments boot without background activity. Rows are processed
 * sequentially in small batches, and the per-row backoff state lives in the
 * table, not in memory, so a restart loses nothing.
 *
 * Safe to run on more than one instance: rows are claimed under a lease with
 * `FOR UPDATE SKIP LOCKED` rather than merely read, so two replicas polling at
 * the same instant divide the queue instead of both submitting the same
 * encounter to Kemenkes (SJ-76). `isPolling` remains a per-process guard
 * against overlapping cycles; it is not what makes concurrency safe.
 */
@Injectable()
export class SatusehatSubmissionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SatusehatSubmissionWorker.name);
  private readonly satusehatConfig: SatusehatConfig;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    configService: ConfigService,
    private readonly submissionService: SatusehatSubmissionService,
    private readonly submissionRepository: SatusehatSubmissionRepository,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.satusehatConfig.isConfigured || !this.satusehatConfig.workerEnabled) {
      this.logger.log('SATUSEHAT submission worker disabled (adapter unconfigured or flag off)');
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.satusehatConfig.workerPollIntervalMs);
    this.pollTimer.unref();
    this.logger.log(
      `SATUSEHAT submission worker polling every ${this.satusehatConfig.workerPollIntervalMs}ms`,
    );
  }

  onApplicationShutdown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Runs one poll cycle; overlapping cycles are skipped, never queued. */
  async pollOnce(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }
    this.isPolling = true;
    try {
      const dueSubmissions = await this.submissionRepository.claimDueSubmissions({
        limit: POLL_BATCH_LIMIT,
        leaseMs: this.satusehatConfig.submissionLeaseMs,
      });
      for (const submission of dueSubmissions) {
        await this.submissionService.processSubmission(submission);
      }
      return dueSubmissions.length;
    } catch {
      this.logger.error(buildSafeErrorLog('satusehat_submission_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
