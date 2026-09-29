'use client';

import type { AnalyticsOperationsData } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import type { AnalyticsKpiDeltaInput } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';

type AnalyticsOperationsKpisProps = {
  operations: AnalyticsOperationsData;
};

const PERCENT = 100;

/**
 * Visits, new patients, the no-show rate, and the median wait and
 * examination times (P29-T11). A shorter wait reads as good news.
 */
export function AnalyticsOperationsKpis({ operations }: AnalyticsOperationsKpisProps) {
  const t = useTranslations('analytics.operations.kpi');
  const format = useFormatter();
  const { totals, comparison } = operations;
  const previous = comparison?.totals;
  const due = totals.completedAppointments + totals.noShowAppointments;
  const newShare =
    totals.visits > 0 ? Math.round((totals.newPatients / totals.visits) * PERCENT) : 0;
  const rate = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : `${format.number(value, { maximumFractionDigits: 1 })}%`;
  const minutes = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : t('minutesValue', { value: format.number(value) });
  function renderDelta(input: AnalyticsKpiDeltaInput) {
    const delta = resolveAnalyticsDelta({ ...input, previous: input.previous ?? null });
    return delta ? (
      <AnalyticsDeltaLine delta={delta} previousLabel={input.previousLabel} />
    ) : undefined;
  }
  return (
    <div className="flex flex-wrap gap-5">
      <AnalyticsKpiTile
        icon="directions_walk"
        label={t('visits')}
        value={format.number(totals.visits)}
        delta={
          previous
            ? renderDelta({
                current: totals.visits,
                previous: previous.visits,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: format.number(previous.visits),
              })
            : undefined
        }
      />
      <AnalyticsKpiTile
        icon="person_add"
        label={t('newPatients')}
        value={format.number(totals.newPatients)}
        delta={
          previous
            ? renderDelta({
                current: totals.newPatients,
                previous: previous.newPatients,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: format.number(previous.newPatients),
              })
            : undefined
        }
        helper={t('newPatientsShare', { percent: newShare })}
      />
      <AnalyticsKpiTile
        icon="event_busy"
        label={t('noShowRate')}
        value={rate(totals.noShowRatePercent)}
        delta={
          previous
            ? renderDelta({
                current: totals.noShowRatePercent,
                previous: previous.noShowRatePercent,
                kind: 'points',
                higherIsBetter: false,
                previousLabel: rate(previous.noShowRatePercent),
              })
            : undefined
        }
        helper={
          due > 0
            ? t('noShowHelper', {
                noShows: format.number(totals.noShowAppointments),
                due: format.number(due),
              })
            : t('noShowNone')
        }
      />
      <AnalyticsKpiTile
        icon="hourglass_top"
        label={t('waitTime')}
        value={minutes(totals.medianWaitMinutes)}
        delta={
          previous
            ? renderDelta({
                current: totals.medianWaitMinutes,
                previous: previous.medianWaitMinutes,
                kind: 'minutes',
                higherIsBetter: false,
                previousLabel: minutes(previous.medianWaitMinutes),
              })
            : undefined
        }
        helper={
          totals.excludedWaitIntervals > 0
            ? t('excludedHelper', { count: format.number(totals.excludedWaitIntervals) })
            : t('waitHelper')
        }
      />
      <AnalyticsKpiTile
        icon="timer"
        label={t('consultTime')}
        value={minutes(totals.medianConsultMinutes)}
        delta={
          previous
            ? renderDelta({
                current: totals.medianConsultMinutes,
                previous: previous.medianConsultMinutes,
                kind: 'minutes',
                higherIsBetter: false,
                previousLabel: minutes(previous.medianConsultMinutes),
              })
            : undefined
        }
        helper={
          totals.excludedConsultIntervals > 0
            ? t('excludedHelper', { count: format.number(totals.excludedConsultIntervals) })
            : t('consultHelper')
        }
      />
    </div>
  );
}
