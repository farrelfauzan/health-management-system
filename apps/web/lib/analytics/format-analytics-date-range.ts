import type { DateTimeFormatOptions } from 'next-intl';

import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';

type DateFormatter = (value: Date, options: DateTimeFormatOptions) => string;

const YEAR_LENGTH = 4;
const MONTH_LENGTH = 7;
const DAY: DateTimeFormatOptions = { day: 'numeric', timeZone: 'UTC' };
const DAY_MONTH: DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
const FULL: DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
};

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * A period as the dashboards write it: "1 – 30 Sep 2026", "29 Sep 2025 –
 * 28 Sep 2026", or one date when both ends match. Built from single-date
 * formats rather than `formatRange`, whose spacing differs between Node's and
 * the browser's ICU and breaks hydration, and read as UTC calendar dates so
 * no server or viewer time zone can move a day.
 */
export function formatAnalyticsDateRange(
  { from, to }: AnalyticsPeriodRange,
  formatDate: DateFormatter,
): string {
  const end = formatDate(toUtcDate(to), FULL);
  if (from === to) {
    return end;
  }
  if (from.slice(0, MONTH_LENGTH) === to.slice(0, MONTH_LENGTH)) {
    return `${formatDate(toUtcDate(from), DAY)} – ${end}`;
  }
  const startOptions = from.slice(0, YEAR_LENGTH) === to.slice(0, YEAR_LENGTH) ? DAY_MONTH : FULL;
  return `${formatDate(toUtcDate(from), startOptions)} – ${end}`;
}
