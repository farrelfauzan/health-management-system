'use client';

import type { AnalyticsGranularity, AnalyticsPracticeData } from '@hms/shared-types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@hms/ui/components/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from '@hms/ui/components/chart-primitives';
import { useFormatter, useTranslations, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsChartLegend } from '#components/client/analytics/analytics-chart-legend';
import { formatAnalyticsBucketLabel } from '#lib/analytics/format-analytics-bucket-label';

type AnalyticsPracticeTrendCardProps = {
  practice: AnalyticsPracticeData;
  granularity: AnalyticsGranularity;
  currentLabel: string;
  previousLabel?: string;
};

const AXIS_WIDTH = 32;

/**
 * The encounters the clinician finished, per bucket, beside the comparison
 * period's paired by position. The same numbers sit in a table for screen
 * readers.
 */
export function AnalyticsPracticeTrendCard({
  practice,
  granularity,
  currentLabel,
  previousLabel,
}: AnalyticsPracticeTrendCardProps) {
  const t = useTranslations('analytics.practice.trend');
  const format = useFormatter();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const previousSeries = practice.comparison?.series ?? [];
  const points = practice.series.map((point, index) => ({
    label: formatAnalyticsBucketLabel(point.bucket, granularity, formatDate),
    current: point.finishedEncounters,
    previous: previousSeries[index]?.finishedEncounters,
  }));
  const config: ChartConfig = {
    current: { label: currentLabel, color: 'var(--color-primary)' },
    previous: { label: previousLabel ?? '', color: 'var(--color-outline-variant)' },
  };
  const ariaLabel = previousLabel
    ? t('ariaLabel', { current: currentLabel, previous: previousLabel })
    : t('ariaLabelSingle', { current: currentLabel });
  return (
    <AnalyticsCard
      title={t(`title.${granularity}`)}
      subtitle={t('subtitle')}
      className="flex-[3_1_0]"
    >
      <AnalyticsChartLegend
        entries={[
          { label: currentLabel, colorClassName: 'bg-primary', isDashed: false },
          ...(previousLabel
            ? [{ label: previousLabel, colorClassName: 'bg-outline-variant', isDashed: false }]
            : []),
        ]}
      />
      <ChartContainer
        config={config}
        role="img"
        aria-label={ariaLabel}
        className="aspect-auto h-[250px] w-full"
      >
        <BarChart data={points} margin={{ left: 0, right: 8, top: 8 }} barGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tickLine={false} axisLine={false} width={AXIS_WIDTH} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {previousLabel ? (
            <Bar
              dataKey="previous"
              fill="var(--color-previous)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ) : null}
          <Bar
            dataKey="current"
            fill="var(--color-current)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
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
          {practice.series.map((point, index) => (
            <tr key={point.bucket}>
              <th scope="row">{point.bucket}</th>
              <td>{format.number(point.finishedEncounters)}</td>
              {previousLabel ? (
                <td>{format.number(previousSeries[index]?.finishedEncounters ?? 0)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </AnalyticsCard>
  );
}
