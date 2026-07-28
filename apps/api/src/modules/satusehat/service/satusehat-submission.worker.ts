import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionService } from './satusehat-submission.service';

const POLL_BATCH_LIMIT = 5;

/**
 * Interval poller for the SATUSEHAT outbox. Starts only when the adapter is
 * configured and the worker flag is on, so dev, CI, and unconfigured
 * deployments boot without background activity. Rows are processed
 * sequentially in small batches — this is a single-instance modular monolith,
 * and the per-row backoff state lives in the table, not in memory, so a
 * restart loses nothing.
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
      const dueSubmissions = await this.submissionRepository.findDueSubmissions(POLL_BATCH_LIMIT);
      for (const submission of dueSubmissions) {
        await this.submissionService.processSubmission(submission);
      }
      return dueSubmissions.length;
    } catch (caughtError) {
      this.logger.error(
        `SATUSEHAT submission poll cycle failed: ${
          caughtError instanceof Error ? caughtError.message : String(caughtError)
        }`,
      );
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
