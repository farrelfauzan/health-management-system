import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isWithinVisitReminderSendWindow } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { MaternalVisitReminderService } from './maternal-visit-reminder.service';

const DEFAULT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * The maternal visit reminder sweep (P25-T17), in the `unref`'d-interval
 * shape of the other sweeps.
 *
 * **Off by default** (`MATERNAL_REMINDERS_ENABLED=true` turns it on): unlike
 * the other sweeps it messages patients, and a clinic should decide to start
 * doing that. It ticks every 15 minutes and only acts from 09:00 to noon on
 * the clinic's clock; each visit is claimed once by a unique index, so the
 * ticks after the first that morning find nothing new to send.
 */
@Injectable()
export class MaternalVisitReminderWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaternalVisitReminderWorker.name);
  private readonly isEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private readonly clinicTimeZone: string;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly reminderService: MaternalVisitReminderService,
    configService: ConfigService,
  ) {
    this.isEnabled = configService.get<string>('MATERNAL_REMINDERS_ENABLED') === 'true';
    this.sweepIntervalMs = this.readSweepIntervalMs(configService);
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  onApplicationBootstrap(): void {
    if (!this.isEnabled) {
      this.logger.log(
        'Maternal visit reminders disabled (MATERNAL_REMINDERS_ENABLED is not "true")',
      );
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Maternal visit reminders sweeping every ${this.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Runs one sweep and returns how many reminders went out; 0 outside the morning window. */
  async sweepOnce(asOf: Date = new Date()): Promise<number> {
    if (
      this.isSweeping ||
      !isWithinVisitReminderSendWindow({ instant: asOf, timeZone: this.clinicTimeZone })
    ) {
      return 0;
    }
    this.isSweeping = true;
    try {
      return await this.reminderService.sendDueReminders(asOf);
    } catch {
      this.logger.error(buildSafeErrorLog('maternal_visit_reminder_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  private readSweepIntervalMs(configService: ConfigService): number {
    const rawValue = configService.get<string>('MATERNAL_REMINDERS_SWEEP_INTERVAL_MS');
    if (rawValue === undefined || rawValue.trim() === '') {
      return DEFAULT_SWEEP_INTERVAL_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        'Maternal visit reminder configuration error: MATERNAL_REMINDERS_SWEEP_INTERVAL_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
