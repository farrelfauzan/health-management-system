'use client';

import { cn } from '@hms/ui';

import { AnalyticsShareLegend } from '#components/client/analytics/analytics-share-legend';
import type { AnalyticsShareSegment } from '#lib/analytics/analytics-filter-state';

type AnalyticsShareBarProps = {
  label: string;
  segments: AnalyticsShareSegment[];
  ariaLabel: string;
};

/** One whole split into its shares, as a single stacked bar with its key underneath. */
export function AnalyticsShareBar({ label, segments, ariaLabel }: AnalyticsShareBarProps) {
  const shown = segments.filter((segment) => segment.percent > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex flex-col gap-2.5">
        <div
          role="img"
          aria-label={ariaLabel}
          className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-surface-container-low"
        >
          {shown.map((segment) => (
            <span
              key={segment.key}
              className={cn('h-full', segment.color.swatchClassName)}
              style={{ width: `${segment.percent}%` }}
            />
          ))}
        </div>
        <AnalyticsShareLegend segments={segments} />
      </div>
    </div>
  );
}
