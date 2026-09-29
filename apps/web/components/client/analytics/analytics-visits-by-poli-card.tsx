'use client';

import { useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsPoliBarRow } from '#components/client/analytics/analytics-poli-bar-row';
import { AnalyticsVisitTypeBar } from '#components/client/analytics/analytics-visit-type-bar';
import type { AnalyticsOperationsBreakdowns } from '@hms/shared-types';

type AnalyticsVisitsByPoliCardProps = {
  breakdowns: AnalyticsOperationsBreakdowns;
  previousLabel?: string;
};

/** Visits per poli with the change against the comparison period, and the visit-type split. */
export function AnalyticsVisitsByPoliCard({
  breakdowns,
  previousLabel,
}: AnalyticsVisitsByPoliCardProps) {
  const t = useTranslations('analytics.operations.poli');
  const maxVisits = Math.max(0, ...breakdowns.visitsByPoli.map((row) => row.visits));
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={previousLabel ? t('subtitle', { range: previousLabel }) : t('subtitleNoCompare')}
      className="flex-1"
    >
      <div className="flex flex-col gap-3">
        {breakdowns.visitsByPoli.map((row) => (
          <AnalyticsPoliBarRow
            key={row.specialtyId ?? 'none'}
            label={row.specialtyName ?? t('noPoli')}
            visits={row.visits}
            previousVisits={previousLabel ? row.previousVisits : undefined}
            maxVisits={maxVisits}
          />
        ))}
      </div>
      <AnalyticsVisitTypeBar visitsByType={breakdowns.visitsByType} />
    </AnalyticsCard>
  );
}
