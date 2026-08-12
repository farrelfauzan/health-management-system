import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AuthRepository } from '../repository/auth.repository';

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1_000;

/**
 * How long an expired token is kept before deletion.
 *
 * Not zero, and that is the point: a row is what lets a reuse attempt be
 * *recognised*. Delete it the moment it expires and a replayed token reads as
 * an unknown hash — indistinguishable from a typo — so the one signal worth
 * having disappears exactly when someone is exercising it. Thirty days keeps
 * the evidence for the length of a plausible investigation.
 */
const RETENTION_AFTER_EXPIRY_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Sweeps long-expired refresh tokens (SJ-6). Follows the same shape as the
 * SATUSEHAT and BPJS pollers — a plain interval on a single-instance modular
 * monolith, unref'd so it never holds the process open.
 */
@Injectable()
export class RefreshTokenCleanupWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RefreshTokenCleanupWorker.name);
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(private readonly authRepository: AuthRepository) {}

  onApplicationBootstrap(): void {
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Runs one sweep; overlapping sweeps are skipped, never queued. */
  async sweepOnce(): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      const cutoff = new Date(Date.now() - RETENTION_AFTER_EXPIRY_MS);
      const deletedCount = await this.authRepository.deleteExpiredRefreshTokens(cutoff);
      if (deletedCount > 0) {
        this.logger.log(`Purged ${deletedCount} expired refresh tokens`);
      }
      return deletedCount;
    } catch {
      // A failed sweep is a housekeeping miss, not a request failure — the
      // next interval retries, and stale rows harm nothing meanwhile.
      this.logger.error(buildSafeErrorLog('refresh_token_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }
}
