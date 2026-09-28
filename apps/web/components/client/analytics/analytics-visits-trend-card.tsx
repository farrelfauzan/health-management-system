'use client';

import type { AnalyticsGranularity } from '@hms/shared-types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@hms/ui/components/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from '@hms/ui/components/chart-primitives';
import { useFormatter, useTranslations, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsChartLegend } from '#components/client/analytics/analytics-chart-legend';
import type { AnalyticsOperationsData } from '@hms/shared-types';
import { formatAnalyticsBucketLabel } from '#lib/analytics/format-analytics-bucket-label';

type AnalyticsVisitsTrendCardProps = {
  operations: AnalyticsOperationsData;
  granularity: AnalyticsGranularity;
  currentLabel: string;
  previousLabel?: string;
};

/**
 * Visits per bucket, this period against the comparison drawn dashed and
 * paired by position. The same numbers sit in a table for screen readers.
 */
export function AnalyticsVisitsTrendCard({
  operations,
  granularity,
  currentLabel,
  previousLabel,
}: AnalyticsVisitsTrendCardProps) {
  const t = useTranslations('analytics.operations.trend');
  const format = useFormatter();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const previousSeries = operations.comparison?.series ?? [];
  const points = operations.series.map((point, index) => ({
    label: formatAnalyticsBucketLabel(point.bucket, granularity, formatDate),
    current: point.visits,
    previous: previousSeries[index]?.visits,
  }));
  const config: ChartConfig = {
    current: { label: currentLabel, color: 'var(--color-primary)' },
    previous: { label: previousLabel ?? '', color: 'var(--color-outline)' },
  };
  const ariaLabel = previousLabel
    ? t('ariaLabel', { current: currentLabel, previous: previousLabel })
    : t('ariaLabelSingle', { current: currentLabel });
  return (
    <AnalyticsCard
      title={t(`title.${granularity}`)}
      subtitle={t('subtitle')}
      className="flex-[2_1_0]"
    >
      <AnalyticsChartLegend
        entries={[
          { label: currentLabel, colorClassName: 'bg-primary', isDashed: false },
          ...(previousLabel
            ? [{ label: previousLabel, colorClassName: 'border-outline', isDashed: true }]
            : []),
        ]}
      />
      <ChartContainer
        config={config}
        role="img"
        aria-label={ariaLabel}
        className="aspect-auto h-[250px] w-full"
      >
        <LineChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {previousLabel ? (
            <Line
              dataKey="previous"
              stroke="var(--color-previous)"
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
          <Line
            dataKey="current"
            stroke="var(--color-current)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{t('tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('bucket')}</th>
            <th scope="col">{t('current')}</th>
            {previousLabel ? <th scope="col">{t('previous')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {operations.series.map((point, index) => (
            <tr key={point.bucket}>
              <th scope="row">{point.bucket}</th>
              <td>{format.number(point.visits)}</td>
              {previousLabel ? <td>{format.number(previousSeries[index]?.visits ?? 0)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </AnalyticsCard>
  );
}
