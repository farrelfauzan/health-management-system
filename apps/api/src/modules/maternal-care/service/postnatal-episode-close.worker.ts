import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { PostnatalEpisodeCloseService } from './postnatal-episode-close.service';

const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The sweep that closes PNC episodes after day 42 (P25-T12), in the
 * `unref`'d-interval shape of the other sweeps. On by default; safe to re-run
 * because a birth that already has a close row is never a candidate again and
 * a racing sweep is refused by the partial unique index.
 */
@Injectable()
export class PostnatalEpisodeCloseWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PostnatalEpisodeCloseWorker.name);
  private readonly isEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly postnatalEpisodeCloseService: PostnatalEpisodeCloseService,
    configService: ConfigService,
  ) {
    this.isEnabled = configService.get<string>('POSTNATAL_EPISODE_CLOSE_WORKER_ENABLED') !== 'false';
    this.sweepIntervalMs = this.readSweepIntervalMs(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.isEnabled) {
      this.logger.log('PNC episode close sweep disabled (POSTNATAL_EPISODE_CLOSE_WORKER_ENABLED=false)');
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`PNC episode close sweeping every ${this.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Runs one sweep and returns how many closes it enqueued. */
  async sweepOnce(asOf: Date = new Date()): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      return await this.postnatalEpisodeCloseService.enqueueDueCloses(asOf);
    } catch {
      this.logger.error(buildSafeErrorLog('postnatal_episode_close_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  private readSweepIntervalMs(configService: ConfigService): number {
    const rawValue = configService.get<string>('POSTNATAL_EPISODE_CLOSE_SWEEP_INTERVAL_MS');
    if (rawValue === undefined || rawValue.trim() === '') {
      return DEFAULT_SWEEP_INTERVAL_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        'PNC episode close configuration error: POSTNATAL_EPISODE_CLOSE_SWEEP_INTERVAL_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
