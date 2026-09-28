'use client';

import {
  BPJS_SUBMISSION_TYPES,
  SATUSEHAT_SUBMISSION_KINDS,
  type AnalyticsReportingHealthData,
  type BpjsSubmissionTypeValue,
  type SatusehatSubmissionKindValue,
} from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { AnalyticsReadinessCard } from '#components/client/analytics/analytics-readiness-card';
import { AnalyticsReportingKpis } from '#components/client/analytics/analytics-reporting-kpis';
import { AnalyticsSubmissionTableCard } from '#components/client/analytics/analytics-submission-table-card';
import type { AnalyticsSubmissionTableRow } from '#lib/analytics/analytics-filter-state';
import { buildSubmissionMonitorHref } from '#lib/integrations/build-submission-monitor-href';

function isSatusehatKind(value: string): value is SatusehatSubmissionKindValue {
  return (SATUSEHAT_SUBMISSION_KINDS as readonly string[]).includes(value);
}

function isBpjsType(value: string): value is BpjsSubmissionTypeValue {
  return (BPJS_SUBMISSION_TYPES as readonly string[]).includes(value);
}

type AnalyticsReportingHealthContentProps = {
  reportingHealth: AnalyticsReportingHealthData;
  generatedAt: string;
};

/** The reporting status page's figures, laid out as the Status pelaporan artboard. */
export function AnalyticsReportingHealthContent({
  reportingHealth,
  generatedAt,
}: AnalyticsReportingHealthContentProps) {
  const t = useTranslations('analytics.reporting');
  const satusehatRows: AnalyticsSubmissionTableRow[] = reportingHealth.satusehat.map(
    ({ kind, ...counts }) => ({
      ...counts,
      key: kind,
      label: isSatusehatKind(kind) ? t(`satusehat.kinds.${kind}`) : kind,
      fixHref: isSatusehatKind(kind)
        ? buildSubmissionMonitorHref({ provider: 'satusehat', status: 'FAILED', kind })
        : undefined,
    }),
  );
  const bpjsRows: AnalyticsSubmissionTableRow[] = (reportingHealth.bpjs ?? []).map(
    ({ type, ...counts }) => ({
      ...counts,
      key: type,
      label: isBpjsType(type) ? t(`bpjs.types.${type}`) : type,
      fixHref: isBpjsType(type)
        ? buildSubmissionMonitorHref({ provider: 'bpjs', status: 'FAILED', type })
        : undefined,
    }),
  );
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsReportingKpis reportingHealth={reportingHealth} generatedAt={generatedAt} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsSubmissionTableCard
          title={t('satusehat.title')}
          subtitle={t('satusehat.subtitle')}
          rows={satusehatRows}
          note={t('satusehat.note')}
        />
        {reportingHealth.bpjs ? (
          <AnalyticsSubmissionTableCard
            title={t('bpjs.title')}
            subtitle={t('bpjs.subtitle')}
            rows={bpjsRows}
          />
        ) : null}
      </div>
      <AnalyticsReadinessCard readiness={reportingHealth.readiness} />
    </div>
  );
}
