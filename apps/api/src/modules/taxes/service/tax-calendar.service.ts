import {
  DueTaxReminder,
  getStartOfCalendarDateInTimeZone,
  TaxSettingsRecord,
  resolveAnnualTaxReturnDueDate,
  resolveCrossedTurnoverFractions,
  resolvePp55Eligibility,
  resolveTaxObligationDueDates,
  TAX_REMINDER_LEAD_DAYS,
  TAX_REPORT_KINDS,
  TaxObligationDueDate,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ClinicianFeeStatementService } from '../../clinician-fee/service/clinician-fee-statement.service';
import { TaxReminderRepository } from '../repository/tax-reminder.repository';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MILLISECONDS_PER_DAY = 86_400_000;
/**
 * How many months back a sweep looks for an unmet obligation. Two: a reminder
 * is only ever raised five days or one day before a due date, and the widest
 * of those sits inside the month after the period. A third month would only
 * find dates already past.
 */
const PERIODS_CONSIDERED = 2;
/** PP 55 ends with a tax year, and the warning starts in its October. */
const PP55_WARNING_FIRST_MONTH = 10;

/**
 * Which tax reminders are owed today (P27-T10).
 *
 * Every question here is answered from the clinic's own settings and its own
 * takings, so a clinic that is not a PKP is never told about PPN and a clinic
 * on the general regime is never told about PP 55. Deciding that here rather
 * than in the worker keeps the worker down to "claim it, then announce it".
 */
@Injectable()
export class TaxCalendarService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxReminderRepository: TaxReminderRepository,
    private readonly taxProfileService: TaxProfileService,
    private readonly clinicianFeeStatementService: ClinicianFeeStatementService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * The due-date reminders that fall today, for periods whose draft is not
   * FINALIZED.
   *
   * A finalized draft silences its obligation entirely: the clinic has done
   * the thing the reminder exists to ask for, and a reminder after that is
   * the kind of noise that teaches people to ignore the channel. Obligations
   * with no draft behind them — the withholding returns — raise nothing, for
   * the honest reason that nothing here knows whether they have been filed.
   */
  async findDueReminders(now: Date): Promise<DueTaxReminder[]> {
    const settings = await this.taxProfileService.getTaxSettings();
    const today = this.resolveClinicToday(now);
    const dueDates = await this.collectDueDates(settings, today);
    const reportedPeriods = await this.resolveFinalizedPeriods(dueDates);
    const reminders: DueTaxReminder[] = [];
    for (const leadDays of TAX_REMINDER_LEAD_DAYS) {
      const targetDate = this.addDays(today, leadDays);
      for (const { dueDate, obligation, reportKind, period } of dueDates) {
        if (dueDate !== targetDate) {
          continue;
        }
        if (reportKind !== null && reportedPeriods.has(`${period}:${reportKind}`)) {
          continue;
        }
        reminders.push({ obligation, period, dueDate, leadDays });
      }
    }
    return reminders;
  }

  /**
   * The turnover warnings this calendar year has crossed, with the year's
   * takings so the notification can name the figure.
   */
  async findTurnoverWarnings(
    now: Date,
  ): Promise<{ year: number; turnoverRupiah: number; fractions: number[] }> {
    const year = Number(this.resolveClinicToday(now).slice(0, 4));
    const turnoverRupiah = await this.taxReminderRepository.sumPaymentsInYear({
      start: this.startOfClinicYear(year),
      end: this.startOfClinicYear(year + 1),
    });
    return { year, turnoverRupiah, fractions: resolveCrossedTurnoverFractions(turnoverRupiah) };
  }

  /**
   * The last year this clinic may use PP 55, once October of that year has
   * arrived — and null at every other moment.
   *
   * October rather than January of the following year because the point is to
   * be told while the next year's arrangements can still be made. A clinic
   * with no end year (an individual, a PT perorangan) is never warned, because
   * there is nothing to warn about.
   */
  async findPp55LastYearWarning(now: Date): Promise<number | null> {
    const settings = await this.taxProfileService.getTaxSettings();
    if (settings.incomeTaxRegime !== 'PP55_FINAL' || settings.taxpayerType === null) {
      return null;
    }
    const today = this.resolveClinicToday(now);
    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7));
    const eligibility = resolvePp55Eligibility({
      taxpayerType: settings.taxpayerType,
      startYear: settings.pp55StartYear,
      currentYear,
    });
    if (eligibility.lastEligibleYear === null) {
      return null;
    }
    if (currentYear !== eligibility.lastEligibleYear || currentMonth < PP55_WARNING_FIRST_MONTH) {
      return null;
    }
    return eligibility.lastEligibleYear;
  }

  /** Claims one reminder; false when it has already been raised. */
  async claimNotice(
    kind: 'OBLIGATION_DUE' | 'TURNOVER_THRESHOLD' | 'PP55_LAST_YEAR',
    noticeKey: string,
  ): Promise<boolean> {
    return this.taxReminderRepository.claimNotice(kind, noticeKey);
  }

  private async collectDueDates(
    settings: TaxSettingsRecord,
    today: string,
  ): Promise<Array<TaxObligationDueDate & { period: string }>> {
    const collected: Array<TaxObligationDueDate & { period: string }> = [];
    for (const period of this.recentPeriods(today)) {
      const dueDates = resolveTaxObligationDueDates({
        period,
        incomeTaxRegime: settings.incomeTaxRegime === 'PP55_FINAL' ? 'PP55' : 'GENERAL',
        isPkp: settings.isPkp,
        hasWithholding: await this.hasWithholding(period),
      });
      collected.push(...dueDates.map((dueDate) => ({ ...dueDate, period })));
    }
    if (settings.taxpayerType !== null) {
      const taxYear = Number(today.slice(0, 4)) - 1;
      const annual = resolveAnnualTaxReturnDueDate({
        taxYear,
        taxpayerType: settings.taxpayerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'ENTITY',
      });
      collected.push({ ...annual, period: String(taxYear) });
    }
    return collected;
  }

  private async resolveFinalizedPeriods(
    dueDates: ReadonlyArray<TaxObligationDueDate & { period: string }>,
  ): Promise<Set<string>> {
    const finalized = new Set<string>();
    for (const kind of TAX_REPORT_KINDS) {
      const periods = dueDates
        .filter((dueDate) => dueDate.reportKind === kind)
        .map((dueDate) => dueDate.period);
      const reported = await this.taxReminderRepository.listFinalizedPeriods(periods, kind);
      for (const period of reported) {
        finalized.add(`${period}:${kind}`);
      }
    }
    return finalized;
  }

  /**
   * Whether any clinician earned a fee in the period (P27-T07): a clinic with
   * no jasa medis that month has no PPh 21 to deposit and no BP21 to issue,
   * so it is not chased for one.
   */
  private async hasWithholding(period: string): Promise<boolean> {
    const summary = await this.clinicianFeeStatementService.getPeriodSummary(period);
    return summary.clinicians.length > 0;
  }

  /** This month and the one before it, as `YYYY-MM`. */
  private recentPeriods(today: string): string[] {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const periods: string[] = [];
    for (let offset = 1; offset <= PERIODS_CONSIDERED; offset += 1) {
      const shifted = new Date(Date.UTC(year, month - 1 - offset, 1));
      periods.push(
        `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
    return periods;
  }

  private startOfClinicYear(year: number): Date {
    return getStartOfCalendarDateInTimeZone(`${year}-01-01`, this.clinicTimeZone);
  }

  private resolveClinicToday(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.clinicTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  private addDays(dateOnly: string, days: number): string {
    const shifted = new Date(`${dateOnly}T00:00:00.000Z`).getTime() + days * MILLISECONDS_PER_DAY;
    return new Date(shifted).toISOString().slice(0, 10);
  }
}
