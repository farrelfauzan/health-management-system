'use client';

import { Icon } from '@hms/ui';
import { useFormatter } from 'next-intl';

import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';
import { formatAnalyticsDateRange } from '#lib/analytics/format-analytics-date-range';

type AnalyticsPeriodRangeChipProps = {
  range: AnalyticsPeriodRange;
};

/** The dates a preset stands for, so "Bulan ini" is never a guess. */
export function AnalyticsPeriodRangeChip({ range }: AnalyticsPeriodRangeChipProps) {
  const format = useFormatter();
  return (
    <span className="flex h-[38px] items-center gap-2 rounded-[10px] border border-slate-200 px-3 text-sm font-medium text-slate-900">
      <Icon name="calendar_month" size={18} className="text-slate-500" />
      {formatAnalyticsDateRange(range, (value, options) => format.dateTime(value, options))}
    </span>
  );
}
