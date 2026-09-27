import { addCalendarDays } from '#analytics/add-calendar-days';
import { addCalendarMonths } from '#analytics/add-calendar-months';
import { countCalendarDays } from '#analytics/count-calendar-days';
import type { AnalyticsPeriod } from '#analytics/types';

function isWholeCalendarMonth({ from, to }: AnalyticsPeriod): boolean {
  const isFirstDay = from.endsWith('-01');
  const lastDayOfMonth = addCalendarDays(addCalendarMonths(from, 1), -1);
  return isFirstDay && to === lastDayOfMonth;
}

/**
 * The period a dashboard compares against (PRD FR-FDN-04). A whole calendar
 * month compares with the whole previous month, so September (30 days) is
 * set against all 31 days of August; any other range compares with the same
 * number of days immediately before it.
 */
export function resolveAnalyticsComparisonPeriod(period: AnalyticsPeriod): AnalyticsPeriod {
  if (isWholeCalendarMonth(period)) {
    const previousMonthStart = addCalendarMonths(period.from, -1);
    return { from: previousMonthStart, to: addCalendarDays(period.from, -1) };
  }
  const dayCount = countCalendarDays(period.from, period.to);
  return {
    from: addCalendarDays(period.from, -dayCount),
    to: addCalendarDays(period.from, -1),
  };
}
