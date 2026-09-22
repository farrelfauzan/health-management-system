import { getStartOfCalendarDateInTimeZone } from '#registration-flow/schemas';
import type { MaternalReportMonthRange } from '#maternal-reporting/types';

const MONTHS_PER_YEAR = 12;

/**
 * The month `YYYY-MM` as the clinic sees it (P25-T15): the instant the first
 * day begins in `timeZone` and the instant the next month begins, so a
 * delivery at 23:59 WIB on the 31st is still this month and one at 00:00 WIB
 * on the 1st is not. The two calendar-day strings bound `@db.Date` columns,
 * which carry no time of day and need no zone.
 */
export function resolveMaternalReportMonthRange(
  month: string,
  timeZone: string,
): MaternalReportMonthRange {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const nextMonthNumber = monthNumber === MONTHS_PER_YEAR ? 1 : monthNumber + 1;
  const nextMonthYear = monthNumber === MONTHS_PER_YEAR ? year + 1 : year;
  const firstDay = `${month}-01`;
  const nextFirstDay = `${String(nextMonthYear)}-${String(nextMonthNumber).padStart(2, '0')}-01`;
  const lastDayNumber = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month,
    timeZone,
    startInclusive: getStartOfCalendarDateInTimeZone(firstDay, timeZone),
    endExclusive: getStartOfCalendarDateInTimeZone(nextFirstDay, timeZone),
    firstDay,
    lastDay: `${month}-${String(lastDayNumber).padStart(2, '0')}`,
  };
}
