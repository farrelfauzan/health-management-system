import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { AntenatalVisitCodeValue } from '#maternal-care/types';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/**
 * Antenatal visits whose frozen K-code is one of `codes` and whose encounter
 * started inside the month (P25-T15). A visit whose code is still null — an
 * encounter not yet closed — is not counted: the number is fixed at close
 * (P25-T06) and a report must not guess it.
 */
export function countAntenatalVisitsByCode(
  source: MonthlyKiaSource,
  codes: readonly AntenatalVisitCodeValue[],
): number {
  return source.antenatalVisits.filter(
    (visit) =>
      visit.visitCode !== null &&
      codes.includes(visit.visitCode) &&
      isWithinMaternalReportMonth(visit.startedAt, source.range),
  ).length;
}
