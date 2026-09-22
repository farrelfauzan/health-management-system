import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { PostnatalVisitCodeValue } from '#maternal-care/schemas';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/**
 * Subjects whose whole visit series was fulfilled, counted in the month the
 * last visit of the series took place (P25-T15). For KF lengkap the subject
 * is the mother's episode and the series is KF1–KF4; for KN lengkap it is one
 * baby and KN1–KN3. A series completed in September is September's figure
 * even when KF1 was in August, which is how the PWS-KIA cumulative reads.
 */
export function countCompletedPostnatalSeries(
  source: MonthlyKiaSource,
  series: readonly PostnatalVisitCodeValue[],
  subjectKey: (visit: MonthlyKiaSource['postnatalVisits'][number]) => string | null,
): number {
  const codesBySubject = new Map<string, Map<PostnatalVisitCodeValue, Date>>();
  for (const visit of source.postnatalVisits) {
    const key = subjectKey(visit);
    if (key === null || visit.visitCode === null || !series.includes(visit.visitCode)) {
      continue;
    }
    const codes = codesBySubject.get(key) ?? new Map<PostnatalVisitCodeValue, Date>();
    codes.set(visit.visitCode, visit.startedAt);
    codesBySubject.set(key, codes);
  }
  return [...codesBySubject.values()].filter((codes) => {
    if (series.some((code) => !codes.has(code))) {
      return false;
    }
    const completedAt = new Date(Math.max(...[...codes.values()].map((date) => date.getTime())));
    return isWithinMaternalReportMonth(completedAt, source.range);
  }).length;
}
