import { UserOffboardingConfig } from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveUserOffboardingConfig } from '../user-offboarding.config';
import { UserOffboardingService } from './user-offboarding.service';

/**
 * Runs the offboarding sweep (`P16-T41`): the seven-days-left email, and the
 * purge when a window closes.
 *
 * Same interval-on-bootstrap shape as the vault and licence expiry workers
 * rather than a scheduler dependency, and every six hours for the same
 * reason: the notice table makes a re-run a no-op, so a longer interval buys
 * only a longer wait after the deadline. Overlapping sweeps are skipped, not
 * queued.
 *
 * What this job does *not* decide is whether a person may sign in. That is
 * read from the date on the login path, so the refusal is correct on the
 * right day whether or not this job is up.
 */
@Injectable()
export class UserOffboardingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(UserOffboardingWorker.name);
  private readonly config: UserOffboardingConfig;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly userOffboardingService: UserOffboardingService,
    configService: ConfigService,
  ) {
    this.config = resolveUserOffboardingConfig(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.config.isSweepEnabled) {
      this.logger.log('Offboarding sweep disabled (OFFBOARDING_SWEEP_ENABLED=false)');
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.config.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Offboarding sweep running every ${this.config.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Runs one sweep and returns how many people it acted on. */
  async sweepOnce(): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      return await this.userOffboardingService.sweepOnce(new Date());
    } catch {
      this.logger.error(buildSafeErrorLog('offboarding_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }
}
