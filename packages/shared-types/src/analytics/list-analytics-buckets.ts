import { addCalendarDays } from '#analytics/add-calendar-days';
import { addCalendarMonths } from '#analytics/add-calendar-months';
import type { AnalyticsGranularity } from '#analytics/contracts';
import type { AnalyticsPeriod } from '#analytics/types';

const DAYS_PER_WEEK = 7;

function startOfBucket(date: string, granularity: AnalyticsGranularity): string {
  if (granularity === 'month') {
    return `${date.slice(0, 7)}-01`;
  }
  if (granularity === 'week') {
    // ISO weeks start on Monday, as Postgres's `date_trunc('week', …)` does.
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return addCalendarDays(date, -((weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK));
  }
  return date;
}

function nextBucket(bucket: string, granularity: AnalyticsGranularity): string {
  if (granularity === 'month') {
    return addCalendarMonths(bucket, 1);
  }
  return addCalendarDays(bucket, granularity === 'week' ? DAYS_PER_WEEK : 1);
}

/**
 * Every bucket start from `from` to `to`, in order, so a series has a point
 * for a quiet day instead of a gap. The first week or month may start before
 * `from`, exactly as the database's `date_trunc` buckets do.
 */
export function listAnalyticsBuckets(
  { from, to }: AnalyticsPeriod,
  granularity: AnalyticsGranularity,
): string[] {
  const buckets: string[] = [];
  for (
    let bucket = startOfBucket(from, granularity);
    bucket <= to;
    bucket = nextBucket(bucket, granularity)
  ) {
    buckets.push(bucket);
  }
  return buckets;
}
