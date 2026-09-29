'use client';

import { cn } from '@hms/ui';

type AnalyticsChartLegendEntry = {
  label: string;
  colorClassName: string;
  isDashed: boolean;
};

type AnalyticsChartLegendProps = {
  entries: AnalyticsChartLegendEntry[];
};

/** A line chart's key: a solid swatch for this period, a dashed rule for the comparison. */
export function AnalyticsChartLegend({ entries }: AnalyticsChartLegendProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {entries.map((entry) => (
        <span
          key={entry.label}
          className="flex items-center gap-1.5 text-xs text-on-surface-variant"
        >
          <span
            aria-hidden="true"
            className={cn(
              entry.isDashed ? 'h-0 w-[18px] border-t-2 border-dashed' : 'size-3 rounded-[3px]',
              entry.colorClassName,
            )}
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}
