import { addCalendarDays } from '#analytics/add-calendar-days';
import { countCalendarDays } from '#analytics/count-calendar-days';
import { resolveAnalyticsGranularity } from '#analytics/resolve-analytics-granularity';
import type { AnalyticsRange, ResolveAnalyticsRangeParams } from '#analytics/types';
import { getStartOfCalendarDateInTimeZone } from '#registration-flow/schemas';

/**
 * Cuts a filter's local dates into UTC instants in the clinic's time zone
 * (PRD FR-FDN-04). `end` is the start of the day after `to`, so 1–31 August
 * in Jakarta is [31 July 17:00 UTC, 31 August 17:00 UTC) and a payment at
 * 23:30 WIB on the 31st is inside it.
 */
export function resolveAnalyticsRange({
  from,
  to,
  timeZone,
}: ResolveAnalyticsRangeParams): AnalyticsRange {
  const dayCount = countCalendarDays(from, to);
  return {
    from,
    to,
    start: getStartOfCalendarDateInTimeZone(from, timeZone),
    end: getStartOfCalendarDateInTimeZone(addCalendarDays(to, 1), timeZone),
    dayCount,
    granularity: resolveAnalyticsGranularity(dayCount),
    timeZone,
  };
}
