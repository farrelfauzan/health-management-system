'use client';

import type { AnalyticsPharmacyData } from '@hms/shared-types';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import type { AnalyticsKpiDeltaInput } from '#lib/analytics/analytics-filter-state';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';

type AnalyticsPharmacyKpisProps = {
  pharmacy: AnalyticsPharmacyData;
};

/**
 * Prescriptions issued, how many were fully dispensed, how long the counter
 * took, and what medication earned (P29-T13). A slower counter reads as bad
 * news.
 */
export function AnalyticsPharmacyKpis({ pharmacy }: AnalyticsPharmacyKpisProps) {
  const t = useTranslations('analytics.pharmacy.kpi');
  const format = useFormatter();
  const locale = useLocale();
  const { totals, comparison } = pharmacy;
  const previous = comparison?.totals;
  const compact = (value: number) => formatRupiah(value, locale, { isCompact: true });
  const percent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : `${format.number(value, { maximumFractionDigits: 1 })}%`;
  const minutes = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : t('minutes', { value: format.number(value) });
  function renderDelta(input: AnalyticsKpiDeltaInput) {
    const delta = resolveAnalyticsDelta({ ...input, previous: input.previous ?? null });
    return delta ? (
      <AnalyticsDeltaLine delta={delta} previousLabel={input.previousLabel} />
    ) : undefined;
  }
  return (
    <div className="flex flex-wrap gap-5">
      <AnalyticsKpiTile
        icon="prescriptions"
        label={t('issued')}
        value={format.number(totals.prescriptionsIssued)}
        delta={
          previous
            ? renderDelta({
                current: totals.prescriptionsIssued,
                previous: previous.prescriptionsIssued,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: format.number(previous.prescriptionsIssued),
              })
            : undefined
        }
        helper={
          totals.filledElsewhere > 0
            ? t('issuedHelper', { elsewhere: format.number(totals.filledElsewhere) })
            : undefined
        }
      />
      <AnalyticsKpiTile
        icon="task_alt"
        label={t('fullyDispensed')}
        value={percent(totals.fullyDispensedPercent)}
        delta={
          previous
            ? renderDelta({
                current: totals.fullyDispensedPercent,
                previous: previous.fullyDispensedPercent,
                kind: 'points',
                higherIsBetter: true,
                previousLabel: percent(previous.fullyDispensedPercent),
              })
            : undefined
        }
        helper={t('fullyDispensedHelper', {
          dispensed: format.number(totals.fullyDispensed),
          partial: format.number(totals.partiallyDispensed),
          cancelled: format.number(totals.cancelled),
        })}
      />
      <AnalyticsKpiTile
        icon="timer"
        label={t('median')}
        value={minutes(totals.medianDispenseMinutes)}
        delta={
          previous
            ? renderDelta({
                current: totals.medianDispenseMinutes,
                previous: previous.medianDispenseMinutes,
                kind: 'minutes',
                higherIsBetter: false,
                previousLabel: minutes(previous.medianDispenseMinutes),
              })
            : undefined
        }
      />
      <AnalyticsKpiTile
        icon="payments"
        label={t('revenue')}
        value={compact(totals.medicationRevenue)}
        delta={
          previous
            ? renderDelta({
                current: totals.medicationRevenue,
                previous: previous.medicationRevenue,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: compact(previous.medicationRevenue),
              })
            : undefined
        }
        helper={t('revenueHelper')}
      />
    </div>
  );
}
