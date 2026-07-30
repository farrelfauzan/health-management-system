'use client';

import { Card, CardContent, CardHeader, CardTitle, Icon, Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import type { PatientManagementControllerGetPatientPrivacyNoticeHistoryV1200Data } from '#lib/api/generated/model/patientManagementControllerGetPatientPrivacyNoticeHistoryV1200Data';
import {
  getPatientManagementControllerGetPatientPrivacyNoticeHistoryV1QueryKey,
  patientManagementControllerGetPatientPrivacyNoticeHistoryV1,
} from '#lib/api/generated/patient-management/patient-management';
import { useApiQuery } from '#lib/api/use-api-query';

type PatientPrivacyHistoryCardProps = { patientId: string };

export function PatientPrivacyHistoryCard({ patientId }: PatientPrivacyHistoryCardProps) {
  const t = useTranslations('clinical.privacyNotice');
  const format = useFormatter();
  const query = useApiQuery<PatientManagementControllerGetPatientPrivacyNoticeHistoryV1200Data>({
    queryKey: getPatientManagementControllerGetPatientPrivacyNoticeHistoryV1QueryKey(patientId),
    queryFn: (signal) =>
      patientManagementControllerGetPatientPrivacyNoticeHistoryV1(patientId, signal),
    errorMessage: 'Failed to load privacy notice history',
    enabled: patientId.length > 0,
  });
  const outcomeLabel =
    query.data?.status.outcome === 'ACKNOWLEDGED' ||
    query.data?.status.outcome === 'PROVIDED_ACKNOWLEDGEMENT_DECLINED' ||
    query.data?.status.outcome === 'DEFERRED_EMERGENCY'
      ? t(`outcomes.${query.data.status.outcome}`)
      : query.data?.status.outcome;

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <Icon name="privacy_tip" size={18} />
          {t('historyTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? <Skeleton className="h-20 w-full" /> : null}
        {query.isError ? <p className="text-sm text-rose-700">{t('historyError')}</p> : null}
        {query.data ? (
          <>
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                query.data.status.requiresCapture
                  ? 'border border-amber-200 bg-amber-50 text-amber-900'
                  : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              <p className="font-medium">
                {query.data.status.requiresCapture ? t('captureRequired') : t('currentRecorded')}
              </p>
              <p className="mt-1 text-xs">
                {t('version', { version: query.data.status.currentVersion })}
                {!query.data.status.requiresCapture
                  ? ` · ${outcomeLabel} · ${format.dateTime(
                      new Date(query.data.status.recordedAt),
                      { dateStyle: 'medium', timeStyle: 'short' },
                    )}`
                  : ''}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {t('historyCount', { count: query.data.history.length })}
            </p>
            <p className="text-xs text-slate-500">{t('notConsent')}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
