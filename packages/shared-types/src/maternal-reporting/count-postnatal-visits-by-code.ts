import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { PostnatalVisitCodeValue } from '#maternal-care/schemas';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/**
 * Nifas or neonatal visits carrying one of `codes` whose encounter started in
 * the month (P25-T15). A visit outside every window has a null code and is
 * not counted, exactly as SATUSEHAT would refuse it.
 */
export function countPostnatalVisitsByCode(
  source: MonthlyKiaSource,
  codes: readonly PostnatalVisitCodeValue[],
): number {
  return source.postnatalVisits.filter(
    (visit) =>
      visit.visitCode !== null &&
      codes.includes(visit.visitCode) &&
      isWithinMaternalReportMonth(visit.startedAt, source.range),
  ).length;
}
