import { isDateWithinMaternalReportMonth } from '#maternal-reporting/is-date-within-maternal-report-month';
import type { ContraceptiveMethodValue } from '#maternal-care/family-planning-schemas';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/**
 * KB acceptors of one method (P25-T15). `NEW` counts courses of a first-time
 * acceptor (`acceptorType = NEW`) started inside the month. `ACTIVE` counts
 * every course live on the month's last day — started on or before it and
 * not discontinued on or before it — which is "peserta KB aktif" as the
 * PWS-KIA reads it. Both read `@db.Date` columns, so the comparison is by
 * calendar day.
 */
export function countFamilyPlanningAcceptors(
  source: MonthlyKiaSource,
  method: ContraceptiveMethodValue,
  kind: 'NEW' | 'ACTIVE',
): number {
  return source.familyPlanning.filter((course) => {
    if (course.method !== method) {
      return false;
    }
    if (kind === 'NEW') {
      return (
        course.acceptorType === 'NEW' &&
        isDateWithinMaternalReportMonth(course.startedOn, source.range)
      );
    }
    const startedDay = course.startedOn.toISOString().slice(0, 10);
    const discontinuedDay = course.discontinuedOn?.toISOString().slice(0, 10) ?? null;
    return (
      startedDay <= source.range.lastDay &&
      (discontinuedDay === null || discontinuedDay > source.range.lastDay)
    );
  }).length;
}
