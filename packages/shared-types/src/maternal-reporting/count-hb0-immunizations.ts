import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/**
 * HB0 doses linked to a newborn care record and given inside the month
 * (P25-T15). Read off the immunisation's own `occurredAt`, not the birth:
 * a baby born on the 31st and vaccinated on the 1st is next month's HB0.
 */
export function countHb0Immunizations(source: MonthlyKiaSource): number {
  return source.hb0GivenAt.filter((givenAt) => isWithinMaternalReportMonth(givenAt, source.range))
    .length;
}
