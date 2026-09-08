'use client';

import { useState } from 'react';
import type { LabReportDownloadView, LabReportVersionView } from '@hms/shared-types';
import { Badge, Button, Icon, Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { labReportControllerDownloadReportV1 } from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { EmptyState } from '#components/shared/empty-state';
import { LabReportRetryButton } from '#components/client/laboratory/lab-report-retry-button';
import { useLabReports } from '#lib/laboratory/use-lab-reports';

const STATUS_CLASSNAMES: Record<LabReportVersionView['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  READY: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
};

type LabReportVersionsProps = {
  labOrderId: string;
};

/**
 * The hasil laboratorium and every version there has been (`P18-T05`).
 * Polls while one is still rendering, so the download button appears without
 * a reload; a failed render says why, because "there is no PDF" without a
 * reason sends the bench to IT.
 */
export function LabReportVersions({ labOrderId }: LabReportVersionsProps) {
  const t = useTranslations('operations.laboratory.reports');
  const format = useFormatter();
  const reports = useLabReports(labOrderId);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  async function handleDownload(): Promise<void> {
    setIsDownloading(true);
    try {
      const download = parseApiSuccess<LabReportDownloadView>(
        await labReportControllerDownloadReportV1(labOrderId),
        t('downloadError'),
      ).data;
      window.open(download.url, '_blank', 'noopener');
    } catch (caughtError) {
      notifyApiError(caughtError, t('downloadError'));
    } finally {
      setIsDownloading(false);
    }
  }

  if (reports.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (reports.isError) {
    return <EmptyState icon="error" title={t('loadError')} />;
  }

  const versions = reports.report?.versions ?? [];

  if (versions.length === 0) {
    return <EmptyState icon="description" title={t('none')} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-semibold text-slate-900">{t('report')}</h3>
        <Button
          type="button"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading || reports.report?.current === undefined}
        >
          <Icon name="download" size={16} />
          {isDownloading ? t('downloading') : t('download')}
        </Button>
      </div>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">
              {t('version', { version: version.version })}
            </span>
            <Badge variant="secondary" className={STATUS_CLASSNAMES[version.status]}>
              {t(`statuses.${version.status}`)}
            </Badge>
            {version.isAmended ? <Badge variant="outline">{t('amendedVersion')}</Badge> : null}
            {reports.report?.current?.id === version.id ? (
              <Badge variant="outline">{t('current')}</Badge>
            ) : null}
            <span className="ml-auto text-xs text-slate-500">
              {version.renderedAt
                ? format.dateTime(new Date(version.renderedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : version.status === 'FAILED'
                  ? t('failedWith', { error: version.lastError ?? '' })
                  : version.nextAttemptAt
                    ? t('retrying', {
                        nextAttemptAt: format.dateTime(new Date(version.nextAttemptAt), {
                          timeStyle: 'short',
                        }),
                      })
                    : null}
            </span>
            <LabReportRetryButton labOrderId={labOrderId} version={version} />
          </li>
        ))}
      </ul>
    </div>
  );
}
