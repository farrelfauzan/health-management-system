import type { MaternalReportMonthRange } from '#maternal-reporting/types';

/** Whether a stored instant falls inside the clinic-local month. */
export function isWithinMaternalReportMonth(
  instant: Date,
  range: MaternalReportMonthRange,
): boolean {
  const time = instant.getTime();
  return time >= range.startInclusive.getTime() && time < range.endExclusive.getTime();
}
