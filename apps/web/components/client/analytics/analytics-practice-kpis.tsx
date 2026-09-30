'use client';

import type { AnalyticsPracticeData } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import type { AnalyticsKpiDeltaInput } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';

type AnalyticsPracticeKpisProps = {
  practice: AnalyticsPracticeData;
};

/**
 * The clinician's patients seen, consultation length, no-shows and session
 * fill (P29-T15). More no-shows read as bad news, and a longer consultation
 * reads the way the operations dashboard reads it.
 */
export function AnalyticsPracticeKpis({ practice }: AnalyticsPracticeKpisProps) {
  const t = useTranslations('analytics.practice.kpi');
  const format = useFormatter();
  const { totals, comparison } = practice;
  const previous = comparison?.totals;
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
        icon="stethoscope"
        label={t('finished')}
        value={format.number(totals.finishedEncounters)}
        delta={
          previous
            ? renderDelta({
                current: totals.finishedEncounters,
                previous: previous.finishedEncounters,
                kind: 'percent',
                higherIsBetter: true,
                previousLabel: format.number(previous.finishedEncounters),
              })
            : undefined
        }
      />
      <AnalyticsKpiTile
        icon="timer"
        label={t('consult')}
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
      />
      <AnalyticsKpiTile
        icon="event_busy"
        label={t('noShow')}
        value={percent(totals.noShowRatePercent)}
        delta={
          previous
            ? renderDelta({
                current: totals.noShowRatePercent,
                previous: previous.noShowRatePercent,
                kind: 'points',
                higherIsBetter: false,
                previousLabel: percent(previous.noShowRatePercent),
              })
            : undefined
        }
        helper={t('noShowHelper', {
          noShows: format.number(totals.noShowAppointments),
          appointments: format.number(totals.completedAppointments + totals.noShowAppointments),
        })}
      />
      <AnalyticsKpiTile
        icon="event_available"
        label={t('utilisation')}
        value={percent(totals.sessionUtilisationPercent)}
        delta={
          previous
            ? renderDelta({
                current: totals.sessionUtilisationPercent,
                previous: previous.sessionUtilisationPercent,
                kind: 'points',
                higherIsBetter: true,
                previousLabel: percent(previous.sessionUtilisationPercent),
              })
            : undefined
        }
        helper={
          totals.sessionCapacity > 0
            ? t('utilisationHelper', {
                booked: format.number(totals.bookedAppointments),
                capacity: format.number(totals.sessionCapacity),
              })
            : undefined
        }
      />
    </div>
  );
}
