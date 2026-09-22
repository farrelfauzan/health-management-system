import type { MaternalReportMonthRange } from '#maternal-reporting/types';

/**
 * Whether a `@db.Date` value (a midnight-UTC instant standing for a calendar
 * day) falls inside the month. Compared as `YYYY-MM-DD` text, never as an
 * instant: the column carries no time of day for a zone to move.
 */
export function isDateWithinMaternalReportMonth(
  dateOnly: Date,
  range: MaternalReportMonthRange,
): boolean {
  const day = dateOnly.toISOString().slice(0, 10);
  return day >= range.firstDay && day <= range.lastDay;
}
