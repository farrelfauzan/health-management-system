'use client';

import type { AnalyticsRevenueByPaymentMethod } from '@hms/shared-types';
import { ChartContainer, type ChartConfig } from '@hms/ui/components/chart';
import { Cell, Pie, PieChart } from '@hms/ui/components/chart-primitives';
import { useLocale, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsShareLegend } from '#components/client/analytics/analytics-share-legend';
import { buildShareSegments } from '#lib/analytics/build-share-segments';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { PAYMENT_METHOD_COLORS } from '#lib/analytics/payment-method-colors';

type AnalyticsPaymentMethodCardProps = {
  methods: AnalyticsRevenueByPaymentMethod[];
  cashReceived: number;
};

const CHART_CONFIG: ChartConfig = {};

/**
 * How the period's cash came in, by payment date: the cashier report's
 * split, drawn as a donut with its shares beside it.
 */
export function AnalyticsPaymentMethodCard({
  methods,
  cashReceived,
}: AnalyticsPaymentMethodCardProps) {
  const t = useTranslations('analytics.finance.methods');
  const locale = useLocale();
  const segments = buildShareSegments(
    methods.map((row) => ({
      key: row.method,
      label: t(`names.${row.method}`),
      value: row.amount,
      color: PAYMENT_METHOD_COLORS[row.method],
    })),
  );
  const paid = segments.filter((segment) => segment.value > 0);
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle', { amount: formatRupiah(cashReceived, locale, { isCompact: true }) })}
      className="flex-1"
    >
      {paid.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <div className="flex items-center gap-5">
          <ChartContainer
            config={CHART_CONFIG}
            role="img"
            aria-label={t('ariaLabel')}
            className="aspect-square h-[140px] shrink-0"
          >
            <PieChart>
              <Pie
                data={paid}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {paid.map((segment) => (
                  <Cell key={segment.key} fill={segment.color.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <AnalyticsShareLegend segments={segments} isStacked />
        </div>
      )}
    </AnalyticsCard>
  );
}
