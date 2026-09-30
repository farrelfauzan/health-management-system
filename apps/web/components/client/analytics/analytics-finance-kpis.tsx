'use client';

import type { AnalyticsFinanceData } from '@hms/shared-types';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import type { AnalyticsKpiDeltaInput } from '#lib/analytics/analytics-filter-state';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';

type AnalyticsFinanceKpisProps = {
  finance: AnalyticsFinanceData;
};

/**
 * Revenue by invoice date, revenue per visit, what the period's invoices
 * still owe, and what was voided (P29-T09). More unpaid or more voided reads
 * as bad news.
 */
export function AnalyticsFinanceKpis({ finance }: AnalyticsFinanceKpisProps) {
  const t = useTranslations('analytics.finance.kpi');
  const format = useFormatter();
  const locale = useLocale();
  const { totals, comparison } = finance;
  const previous = comparison?.totals;
  const compact = (value: number) => formatRupiah(value, locale, { isCompact: true });
  function renderDelta(input: AnalyticsKpiDeltaInput) {
    const delta = resolveAnalyticsDelta({ ...input, previous: input.previous ?? null });
    return delta ? (
      <AnalyticsDeltaLine delta={delta} previousLabel={input.previousLabel} />
    ) : undefined;
  }
  return (
    <div className="flex flex-wrap gap-5">
      <AnalyticsKpiTile
        icon="payments"
        label={t('revenue')}
        value={compact(totals.revenue)}
        delta={
          previous
            ? renderDelta({
                current: totals.revenue,
                previous: previous.revenue,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: compact(previous.revenue),
              })
            : undefined
        }
        helper={t('revenueHelper', { cash: compact(totals.cashReceived) })}
      />
      <AnalyticsKpiTile
        icon="receipt"
        label={t('perVisit')}
        value={totals.revenuePerVisit === null ? '—' : compact(totals.revenuePerVisit)}
        delta={
          previous && previous.revenuePerVisit !== null
            ? renderDelta({
                current: totals.revenuePerVisit,
                previous: previous.revenuePerVisit,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: compact(previous.revenuePerVisit),
              })
            : undefined
        }
        helper={t('perVisitHelper', { visits: format.number(totals.invoicedVisits) })}
      />
      <AnalyticsKpiTile
        icon="pending_actions"
        label={t('unpaid')}
        value={compact(totals.unpaidAmount)}
        delta={
          previous
            ? renderDelta({
                current: totals.unpaidAmount,
                previous: previous.unpaidAmount,
                kind: 'rupiah',
                higherIsBetter: false,
                previousLabel: compact(previous.unpaidAmount),
              })
            : undefined
        }
        helper={t('unpaidHelper', { invoices: format.number(totals.unpaidInvoices) })}
      />
      <AnalyticsKpiTile
        icon="block"
        label={t('voided')}
        value={compact(totals.voidedAmount)}
        delta={
          previous
            ? renderDelta({
                current: totals.voidedInvoices,
                previous: previous.voidedInvoices,
                kind: 'invoices',
                higherIsBetter: false,
                previousLabel: t('voidedHelper', {
                  invoices: format.number(previous.voidedInvoices),
                }),
              })
            : undefined
        }
        helper={t('voidedHelper', { invoices: format.number(totals.voidedInvoices) })}
      />
    </div>
  );
}
