import type { AnalyticsGranularity } from '@hms/shared-types';
import type { DateTimeFormatOptions } from 'next-intl';

type DateFormatter = (value: Date, options: DateTimeFormatOptions) => string;

const OPTIONS_BY_GRANULARITY: Readonly<Record<AnalyticsGranularity, DateTimeFormatOptions>> = {
  day: { day: 'numeric' },
  week: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: '2-digit' },
};

/**
 * A chart axis label for a bucket: the day number for a daily chart ("7"),
 * the week's Monday for a weekly one ("7 Sep"), the month for a monthly one
 * ("Sep 26"). Buckets are local calendar dates, so no time zone applies.
 */
export function formatAnalyticsBucketLabel(
  bucket: string,
  granularity: AnalyticsGranularity,
  formatDate: DateFormatter,
): string {
  return formatDate(new Date(`${bucket}T00:00:00Z`), {
    ...OPTIONS_BY_GRANULARITY[granularity],
    timeZone: 'UTC',
  });
}
