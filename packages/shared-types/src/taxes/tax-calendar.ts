import { resolveTaxReportDueDates } from '#taxes/resolve-tax-report-due-dates';
import type { TaxObligationDueDate } from '#taxes/types';

/**
 * How many days before a due date a reminder is raised (P27-T10).
 *
 * Widest first, so a sweep that was down over the five-day mark still raises
 * it before the one-day one — each is claimed separately, so neither is lost
 * to the other having fired.
 */
export const TAX_REMINDER_LEAD_DAYS: readonly number[] = [5, 1];

const MONTHLY_RETURN_FILING_DAY = 20;
const ANNUAL_INDIVIDUAL_RETURN_MONTH = 3;
const ANNUAL_ENTITY_RETURN_MONTH = 4;

/**
 * The statutory due dates that fall out of one monthly period (PMK 81/2024).
 *
 * The two dates a report is filed against come from
 * {@link resolveTaxReportDueDates}, which P27-T05 already wrote and which the
 * report screen reads: one rule, so a reminder can never name a date the
 * report itself disagrees with. What this adds is everything with no report
 * behind it — the withholding returns and the annual ones — and the question
 * of *which* obligations a given clinic actually has.
 *
 * **The working-day shift is deliberately not applied**, as it is not there.
 * A due date landing on a holiday moves to the next working day, but doing
 * that would need a national holiday calendar, and this repository has none. A
 * shift that moved a date off a Sunday but not off Idul Fitri would be worse
 * than no shift at all, because a clinic would trust it. The reminders that
 * read these dates fire five days and one day ahead — early enough that the
 * difference does not decide whether a clinic files on time.
 *
 * What is emitted depends on what the clinic actually owes:
 *
 * - PP 55 income tax is deposited monthly by the 15th, and only under that
 *   regime — a clinic on the general regime pays differently and this table
 *   would be telling it to do the wrong thing.
 * - PPN is deposited and filed together by the end of the following month,
 *   and only by a PKP. A non-PKP clinic never charges PPN (D-038), so a PPN
 *   due date for one is noise.
 * - The monthly returns for PPh 21/26 and Unifikasi fall due on the 20th for
 *   every clinic that withholds. They are listed because the calendar is the
 *   calendar; nothing here reports on them, which is why they raise no
 *   draft-gated reminder.
 */
export function resolveTaxObligationDueDates(params: {
  /** `YYYY-MM`, the period being reported on. */
  period: string;
  incomeTaxRegime: 'PP55' | 'GENERAL';
  isPkp: boolean;
}): TaxObligationDueDate[] {
  const { year, month } = parsePeriod(params.period);
  const dueDates: TaxObligationDueDate[] = [];
  if (params.incomeTaxRegime === 'PP55') {
    dueDates.push({
      obligation: 'PP55_INCOME_TAX_DEPOSIT',
      dueDate: resolveTaxReportDueDates(params.period, 'PP55_OMZET').paymentDueDate,
      reportKind: 'PP55_OMZET',
    });
  }
  if (params.isPkp) {
    dueDates.push({
      obligation: 'PPN_DEPOSIT_AND_RETURN',
      dueDate: resolveTaxReportDueDates(params.period, 'PPN_OUTPUT').reportingDueDate,
      reportKind: 'PPN_OUTPUT',
    });
  }
  dueDates.push(
    {
      obligation: 'WITHHOLDING_RETURN_PPH_21_26',
      dueDate: buildDayOfNextMonth(year, month, MONTHLY_RETURN_FILING_DAY),
      reportKind: null,
    },
    {
      obligation: 'WITHHOLDING_RETURN_UNIFICATION',
      dueDate: buildDayOfNextMonth(year, month, MONTHLY_RETURN_FILING_DAY),
      reportKind: null,
    },
  );
  return dueDates;
}

/**
 * When the annual return for `taxYear` falls due: end of March for an
 * individual, end of April for an entity.
 */
export function resolveAnnualTaxReturnDueDate(params: {
  taxYear: number;
  taxpayerType: 'INDIVIDUAL' | 'ENTITY';
}): TaxObligationDueDate {
  const filingYear = params.taxYear + 1;
  const isIndividual = params.taxpayerType === 'INDIVIDUAL';
  const month = isIndividual ? ANNUAL_INDIVIDUAL_RETURN_MONTH : ANNUAL_ENTITY_RETURN_MONTH;
  return {
    obligation: isIndividual ? 'ANNUAL_RETURN_INDIVIDUAL' : 'ANNUAL_RETURN_ENTITY',
    dueDate: buildLastDayOfMonth(filingYear, month),
    reportKind: null,
  };
}

function parsePeriod(period: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (match === null) {
    throw new Error(`Tax period must be YYYY-MM, received "${period}"`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** `YYYY-MM-DD` for a day of the month after the period, rolling the year. */
function buildDayOfNextMonth(year: number, month: number, day: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return formatDateOnly(nextYear, nextMonth, day);
}

function buildLastDayOfMonth(year: number, month: number): string {
  // Day zero of the following month is the last day of this one, and
  // `Date.UTC` rolls December into January for us.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatDateOnly(year, month, lastDay);
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
