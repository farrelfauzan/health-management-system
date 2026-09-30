'use client';

import type { AnalyticsPharmacyData } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsExpiringBatchesCard } from '#components/client/analytics/analytics-expiring-batches-card';
import { AnalyticsPharmacyKpis } from '#components/client/analytics/analytics-pharmacy-kpis';
import { AnalyticsPrescriptionFlowCard } from '#components/client/analytics/analytics-prescription-flow-card';
import { AnalyticsReorderCard } from '#components/client/analytics/analytics-reorder-card';
import { AnalyticsTopMedicationsCard } from '#components/client/analytics/analytics-top-medications-card';

type AnalyticsPharmacyContentProps = {
  pharmacy: AnalyticsPharmacyData;
};

/**
 * The pharmacy figures, laid out as the Farmasi artboard. The stock cards
 * are now, whatever the period, and each says so underneath.
 */
export function AnalyticsPharmacyContent({ pharmacy }: AnalyticsPharmacyContentProps) {
  const t = useTranslations('analytics.pharmacy');
  const format = useFormatter();
  const { stock } = pharmacy.breakdowns;
  const asOfLabel = t('stockAsOf', {
    date: format.dateTime(new Date(`${stock.asOfDate}T00:00:00Z`), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  });
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPharmacyKpis pharmacy={pharmacy} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsTopMedicationsCard medications={pharmacy.breakdowns.topMedications} />
        <AnalyticsReorderCard stock={stock} asOfLabel={asOfLabel} />
      </div>
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsExpiringBatchesCard expiring={stock.expiring} asOfLabel={asOfLabel} />
        <AnalyticsPrescriptionFlowCard totals={pharmacy.totals} />
      </div>
    </div>
  );
}
