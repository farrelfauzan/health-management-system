'use client';

import type { AnalyticsLaboratoryData } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import type { AnalyticsKpiDeltaInput } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';
import { useTurnaroundLabel } from '#lib/analytics/use-turnaround-label';

type AnalyticsLaboratoryKpisProps = {
  laboratory: AnalyticsLaboratoryData;
};

/**
 * Orders placed, how long results took, and how often a sample was taken
 * again (P29-T14). Slower results and more retakes read as bad news.
 */
export function AnalyticsLaboratoryKpis({ laboratory }: AnalyticsLaboratoryKpisProps) {
  const t = useTranslations('analytics.laboratory.kpi');
  const format = useFormatter();
  const turnaround = useTurnaroundLabel();
  const { totals, comparison } = laboratory;
  const previous = comparison?.totals;
  const percent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : `${format.number(value, { maximumFractionDigits: 1 })}%`;
  function renderDelta(input: AnalyticsKpiDeltaInput) {
    const delta = resolveAnalyticsDelta({ ...input, previous: input.previous ?? null });
    return delta ? (
      <AnalyticsDeltaLine delta={delta} previousLabel={input.previousLabel} />
    ) : undefined;
  }
  return (
    <div className="flex flex-wrap gap-5">
      <AnalyticsKpiTile
        icon="biotech"
        label={t('orders')}
        value={format.number(totals.orders)}
        delta={
          previous
            ? renderDelta({
                current: totals.orders,
                previous: previous.orders,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: format.number(previous.orders),
              })
            : undefined
        }
      />
      <AnalyticsKpiTile
        icon="timer"
        label={t('median')}
        value={turnaround(totals.medianTurnaroundMinutes)}
        delta={
          previous
            ? renderDelta({
                current: totals.medianTurnaroundMinutes,
                previous: previous.medianTurnaroundMinutes,
                kind: 'minutes',
                higherIsBetter: false,
                previousLabel: turnaround(previous.medianTurnaroundMinutes),
              })
            : undefined
        }
        helper={t('medianHelper')}
      />
      <AnalyticsKpiTile
        icon="schedule"
        label={t('p90')}
        value={turnaround(totals.p90TurnaroundMinutes)}
        delta={
          previous
            ? renderDelta({
                current: totals.p90TurnaroundMinutes,
                previous: previous.p90TurnaroundMinutes,
                kind: 'minutes',
                higherIsBetter: false,
                previousLabel: turnaround(previous.p90TurnaroundMinutes),
              })
            : undefined
        }
      />
      <AnalyticsKpiTile
        icon="replay"
        label={t('recollection')}
        value={percent(totals.recollectionRatePercent)}
        delta={
          previous
            ? renderDelta({
                current: totals.recollectionRatePercent,
                previous: previous.recollectionRatePercent,
                kind: 'points',
                higherIsBetter: false,
                previousLabel: percent(previous.recollectionRatePercent),
              })
            : undefined
        }
        helper={t('recollectionHelper', { cancelled: percent(totals.cancellationRatePercent) })}
      />
    </div>
  );
}
