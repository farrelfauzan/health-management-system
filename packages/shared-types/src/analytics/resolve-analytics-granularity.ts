import type { AnalyticsGranularity } from '#analytics/contracts';

const MAX_DAILY_DAYS = 45;
const MAX_WEEKLY_DAYS = 26 * 7;

/**
 * The series bucket for a range length (PRD FR-FDN-04): days up to 45 days,
 * weeks up to 26 weeks, months beyond — so no chart has more than about 45
 * points or fewer than a handful.
 */
export function resolveAnalyticsGranularity(dayCount: number): AnalyticsGranularity {
  if (dayCount <= MAX_DAILY_DAYS) {
    return 'day';
  }
  return dayCount <= MAX_WEEKLY_DAYS ? 'week' : 'month';
}
