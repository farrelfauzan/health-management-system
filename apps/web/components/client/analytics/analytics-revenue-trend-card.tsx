'use client';

import type { AnalyticsFinanceData, AnalyticsGranularity } from '@hms/shared-types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@hms/ui/components/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from '@hms/ui/components/chart-primitives';
import { useFormatter, useLocale, useTranslations, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsChartLegend } from '#components/client/analytics/analytics-chart-legend';
import { formatAnalyticsBucketLabel } from '#lib/analytics/format-analytics-bucket-label';
import { formatRupiah } from '#lib/analytics/format-rupiah';

type AnalyticsRevenueTrendCardProps = {
  finance: AnalyticsFinanceData;
  granularity: AnalyticsGranularity;
  currentLabel: string;
  previousLabel?: string;
};

const AXIS_WIDTH = 64;

/**
 * Revenue per bucket by invoice date, the comparison period's bar beside
 * each and paired by position. The same numbers sit in a table for screen
 * readers.
 */
export function AnalyticsRevenueTrendCard({
  finance,
  granularity,
  currentLabel,
  previousLabel,
}: AnalyticsRevenueTrendCardProps) {
  const t = useTranslations('analytics.finance.trend');
  const format = useFormatter();
  const locale = useLocale();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const compact = (value: number) => formatRupiah(value, locale, { isCompact: true });
  const previousSeries = finance.comparison?.series ?? [];
  const points = finance.series.map((point, index) => ({
    label: formatAnalyticsBucketLabel(point.bucket, granularity, formatDate),
    current: point.revenue,
    previous: previousSeries[index]?.revenue,
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
      className="flex-[2_1_0]"
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
          <YAxis
            tickLine={false}
            axisLine={false}
            width={AXIS_WIDTH}
            tickFormatter={(value: number) => compact(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) =>
                  `${String(config[String(name)]?.label ?? '')} ${compact(Number(value))}`
                }
              />
            }
          />
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
          {finance.series.map((point, index) => (
            <tr key={point.bucket}>
              <th scope="row">{point.bucket}</th>
              <td>{formatRupiah(point.revenue, locale)}</td>
              {previousLabel ? (
                <td>{formatRupiah(previousSeries[index]?.revenue ?? 0, locale)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </AnalyticsCard>
  );
}
