import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveBpjsPcareAdapterConfig } from '../../../common/bpjs-pcare/bpjs-pcare.config';
import { BpjsPcareAdapterConfig } from '../../../common/bpjs-pcare/bpjs-pcare.types';
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
      const dueSubmissions = await this.submissionRepository.findDueSubmissions(POLL_BATCH_LIMIT);
      for (const submission of dueSubmissions) {
        await this.submissionService.processSubmission(submission);
      }
      return dueSubmissions.length;
    } catch (caughtError) {
      this.logger.error(
        `BPJS submission poll cycle failed: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
      );
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
