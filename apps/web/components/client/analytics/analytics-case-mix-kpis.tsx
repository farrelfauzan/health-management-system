'use client';

import type { AnalyticsCaseMixData } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import type { AnalyticsKpiDeltaInput } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';

type AnalyticsCaseMixKpisProps = {
  caseMix: AnalyticsCaseMixData;
};

/** Finished encounters, how completely they are coded, and how many codes were used (P29-T12). */
export function AnalyticsCaseMixKpis({ caseMix }: AnalyticsCaseMixKpisProps) {
  const t = useTranslations('analytics.caseMix.kpi');
  const format = useFormatter();
  const { totals, comparison } = caseMix;
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
        icon="clinical_notes"
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
        icon="fact_check"
        label={t('completeness')}
        value={percent(totals.codingCompletenessPercent)}
        delta={
          previous
            ? renderDelta({
                current: totals.codingCompletenessPercent,
                previous: previous.codingCompletenessPercent,
                kind: 'points',
                higherIsBetter: true,
                previousLabel: percent(previous.codingCompletenessPercent),
              })
            : undefined
        }
        helper={t('completenessHelper', { count: format.number(totals.uncodedEncounters) })}
      />
      <AnalyticsKpiTile
        icon="tag"
        label={t('distinctCodes')}
        value={format.number(totals.distinctCodes)}
        delta={
          previous
            ? renderDelta({
                current: totals.distinctCodes,
                previous: previous.distinctCodes,
                kind: 'count',
                higherIsBetter: true,
                previousLabel: format.number(previous.distinctCodes),
              })
            : undefined
        }
      />
    </div>
  );
}
