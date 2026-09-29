'use client';

import type { AnalyticsReportingHealthData } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsKpiTile } from '#components/client/analytics/analytics-kpi-tile';
import { resolveElapsedParts } from '#lib/analytics/resolve-elapsed-parts';

type AnalyticsReportingKpisProps = {
  reportingHealth: AnalyticsReportingHealthData;
  generatedAt: string;
};

function findOldestPendingAt(reportingHealth: AnalyticsReportingHealthData): string | null {
  const times = reportingHealth.satusehat
    .map((row) => row.oldestPendingAt)
    .filter((value): value is string => value !== null)
    .sort();
  return times[0] ?? null;
}

/** Sent in the period, pending and failed now, and BPJS failures when BPJS is on. */
export function AnalyticsReportingKpis({
  reportingHealth,
  generatedAt,
}: AnalyticsReportingKpisProps) {
  const t = useTranslations('analytics.reporting');
  const format = useFormatter();
  const sum = (field: 'submitted' | 'pending' | 'failed') =>
    reportingHealth.satusehat.reduce((total, row) => total + row[field], 0);
  const oldestPendingAt = findOldestPendingAt(reportingHealth);
  const age = oldestPendingAt ? resolveElapsedParts(oldestPendingAt, generatedAt) : null;
  const bpjs = reportingHealth.bpjs;
  return (
    <div className="flex flex-wrap gap-5">
      <AnalyticsKpiTile
        icon="cloud_done"
        label={t('kpi.submitted')}
        value={format.number(sum('submitted'))}
        helper={t('kpi.submittedHelper')}
      />
      <AnalyticsKpiTile
        icon="cloud_sync"
        label={t('kpi.pending')}
        value={format.number(sum('pending'))}
        helper={
          age ? t('kpi.pendingOldest', { age: t(`age.${age.unit}`, age) }) : t('kpi.pendingNone')
        }
      />
      <AnalyticsKpiTile
        icon="cloud_off"
        label={t('kpi.failed')}
        value={format.number(sum('failed'))}
        helper={t('kpi.failedHelper')}
      />
      {bpjs ? (
        <AnalyticsKpiTile
          icon="error"
          label={t('kpi.bpjsFailed')}
          value={format.number(bpjs.reduce((total, row) => total + row.failed, 0))}
          helper={t('kpi.bpjsHelper', {
            submitted: format.number(bpjs.reduce((total, row) => total + row.submitted, 0)),
          })}
        />
      ) : null}
    </div>
  );
}
