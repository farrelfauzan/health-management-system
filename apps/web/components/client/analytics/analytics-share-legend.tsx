'use client';

import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { AnalyticsShareSegment } from '#lib/analytics/analytics-filter-state';

type AnalyticsShareLegendProps = {
  segments: AnalyticsShareSegment[];
  /** One row per segment with the share right-aligned, as beside a donut. */
  isStacked?: boolean;
};

/** The key to a share chart: each segment's swatch, label and share. */
export function AnalyticsShareLegend({ segments, isStacked = false }: AnalyticsShareLegendProps) {
  const t = useTranslations('analytics.finance.payers');
  if (isStacked) {
    return (
      <ul className="flex grow flex-col gap-2.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-[13px] text-slate-900">
            <span
              aria-hidden="true"
              className={cn('size-2.5 rounded-[3px]', segment.color.swatchClassName)}
            />
            <span className="grow">{segment.label}</span>
            <strong className="font-semibold tabular-nums">{segment.percent}%</strong>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1">
      {segments.map((segment) => (
        <li key={segment.key} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span
            aria-hidden="true"
            className={cn('size-2.5 rounded-[3px]', segment.color.swatchClassName)}
          />
          {t('share', { label: segment.label, percent: segment.percent })}
        </li>
      ))}
    </ul>
  );
}
