import { PKP_TURNOVER_THRESHOLD_RUPIAH, DueTaxReminder } from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { NotificationService } from '../../notification/service/notification.service';
import { TaxCalendarService } from './tax-calendar.service';

const DEFAULT_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TAX_REPORT_WRITE_PERMISSION_KEY = 'tax-report.write:any';
const TAX_DASHBOARD_HREF = '/admin/taxes';
const PERCENT = 100;

/**
 * The tax calendar sweep (P27-T10).
 *
 * Follows `DoctorLicenseExpiryWorker`'s shape — an interval armed on
 * bootstrap, `unref`'d so it never holds the process open — and, like that
 * one, defaults **on**. A compliance reminder that silently never fires unless
 * somebody remembered an environment variable is worse than no feature at all.
 *
 * Every announcement is claimed first, so this is safe to run as often as it
 * likes and safe to restart: the claim is keyed to the reminder, not to the
 * day the sweep happened to observe it, which is what lets a five-day mark
 * that passed while the process was down still be announced.
 */
@Injectable()
export class TaxCalendarWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TaxCalendarWorker.name);
  private readonly isEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly taxCalendarService: TaxCalendarService,
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.isEnabled = configService.get<string>('TAX_CALENDAR_REMINDERS_ENABLED') !== 'false';
    this.sweepIntervalMs = this.readSweepIntervalMs(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.isEnabled) {
      this.logger.log('Tax calendar reminders disabled (TAX_CALENDAR_REMINDERS_ENABLED=false)');
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce(new Date());
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Tax calendar reminders sweeping every ${this.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Runs one sweep and returns how many notifications it raised. */
  async sweepOnce(now: Date): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      return (
        (await this.announceDueDates(now)) +
        (await this.announceTurnover(now)) +
        (await this.announcePp55LastYear(now))
      );
    } catch {
      this.logger.error(buildSafeErrorLog('tax_calendar_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  private async announceDueDates(now: Date): Promise<number> {
    const reminders = await this.taxCalendarService.findDueReminders(now);
    let raisedCount = 0;
    for (const reminder of reminders) {
      const claimed = await this.taxCalendarService.claimNotice(
        'OBLIGATION_DUE',
        `DUE:${reminder.period}:${reminder.obligation}:${reminder.leadDays}`,
      );
      if (!claimed) {
        continue;
      }
      raisedCount += await this.notifyTaxFilers(reminder);
    }
    return raisedCount;
  }

  private async notifyTaxFilers(reminder: DueTaxReminder): Promise<number> {
    return this.notificationService.createForUsersWithPermission(
      TAX_REPORT_WRITE_PERMISSION_KEY,
      {
        type: 'TAX_OBLIGATION_DUE',
        titleKey: 'taxObligationDue.title',
        bodyKey: 'taxObligationDue.body',
        params: {
          obligation: reminder.obligation,
          period: reminder.period,
          dueDate: reminder.dueDate,
          daysUntilDue: String(reminder.leadDays),
        },
        href: TAX_DASHBOARD_HREF,
      },
    );
  }

  /**
   * One warning per crossed mark per year. The 100% one says the clinic is
   * now obliged to register; the 80% one says it is close, which is the only
   * moment the warning can still change anything.
   */
  private async announceTurnover(now: Date): Promise<number> {
    const { year, turnoverRupiah, fractions } = await this.taxCalendarService.findTurnoverWarnings(
      now,
    );
    let raisedCount = 0;
    for (const fraction of fractions) {
      const percent = Math.round(fraction * PERCENT);
      const claimed = await this.taxCalendarService.claimNotice(
        'TURNOVER_THRESHOLD',
        `TURNOVER:${year}:${percent}`,
      );
      if (!claimed) {
        continue;
      }
      raisedCount += await this.notificationService.createForUsersWithPermission(
        TAX_REPORT_WRITE_PERMISSION_KEY,
        {
          type: 'TAX_TURNOVER_THRESHOLD',
          titleKey: percent === PERCENT ? 'taxTurnoverReached.title' : 'taxTurnoverNearing.title',
          bodyKey: percent === PERCENT ? 'taxTurnoverReached.body' : 'taxTurnoverNearing.body',
          params: {
            year: String(year),
            percent: String(percent),
            turnover: String(turnoverRupiah),
            threshold: String(PKP_TURNOVER_THRESHOLD_RUPIAH),
          },
          href: TAX_DASHBOARD_HREF,
        },
      );
    }
    return raisedCount;
  }

  private async announcePp55LastYear(now: Date): Promise<number> {
    const lastEligibleYear = await this.taxCalendarService.findPp55LastYearWarning(now);
    if (lastEligibleYear === null) {
      return 0;
    }
    const claimed = await this.taxCalendarService.claimNotice(
      'PP55_LAST_YEAR',
      `PP55_LAST_YEAR:${lastEligibleYear}`,
    );
    if (!claimed) {
      return 0;
    }
    return this.notificationService.createForUsersWithPermission(
      TAX_REPORT_WRITE_PERMISSION_KEY,
      {
        type: 'TAX_PP55_LAST_YEAR',
        titleKey: 'taxPp55LastYear.title',
        bodyKey: 'taxPp55LastYear.body',
        params: { lastEligibleYear: String(lastEligibleYear) },
        href: TAX_DASHBOARD_HREF,
      },
    );
  }

  private readSweepIntervalMs(configService: ConfigService): number {
    const rawValue = configService.get<string>('TAX_CALENDAR_SWEEP_INTERVAL_MS');
    if (rawValue === undefined || rawValue.trim() === '') {
      return DEFAULT_SWEEP_INTERVAL_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        'Tax calendar configuration error: TAX_CALENDAR_SWEEP_INTERVAL_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
