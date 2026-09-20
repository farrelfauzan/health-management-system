'use client';

import { useState } from 'react';
import type { DoctorAuthorityDownloadView, DoctorMandate } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { DoctorMandatePolicyWarningList } from '#components/client/doctors/doctor-mandate-policy-warning-list';
import { DoctorMandateStatusBadge } from '#components/client/doctors/doctor-mandate-status-badge';
import { doctorMandateControllerGetInstructionDownloadUrlV1 } from '#lib/api/generated/doctor-mandates/doctor-mandates';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

type DoctorMandateRowProps = {
  mandate: DoctorMandate;
  canWrite: boolean;
  onRevoke: (mandate: DoctorMandate) => void;
};

/**
 * One pelimpahan inside `DoctorMandatesCard`. Names the doctor who answers for
 * it and lists the procedures it covers, because those two together are what
 * makes it enforceable rather than filed. There is no edit action: a mandate
 * is a signed instruction, so a change is a new one and a revoke.
 */
export function DoctorMandateRow({ mandate, canWrite, onRevoke }: DoctorMandateRowProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const formatDate = (value: string): string =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const isRevoked = mandate.status === 'REVOKED';

  async function handleDownload(): Promise<void> {
    setIsDownloading(true);
    try {
      const response = parseApiSuccess<DoctorAuthorityDownloadView>(
        await doctorMandateControllerGetInstructionDownloadUrlV1(
          mandate.midwifeDoctorId,
          mandate.id,
        ),
        t('doctors.mandates.downloadError'),
      );
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyApiError(error, t('doctors.mandates.downloadError'));
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2 @md/mandates:flex-row @md/mandates:items-start @md/mandates:justify-between @md/mandates:gap-3"
      data-testid={`doctor-mandate-${mandate.id}`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-slate-900">
          {t(`doctors.mandates.kind.${mandate.kind}`)}
        </p>
        <p className="text-xs break-words text-slate-600">
          {t('doctors.mandates.mandatedBy', { name: mandate.mandatingDoctorName })}
        </p>
        <p className="text-xs break-words text-slate-600">
          {t('doctors.mandates.procedures')}:{' '}
          <span className="font-mono">{mandate.icd9cmCodes.join(', ')}</span>
        </p>
        <p className="text-xs break-words text-slate-500">{mandate.instruction}</p>
        <p className="text-xs text-slate-500">
          {t('doctors.authorities.validity.range', {
            from: formatDate(mandate.validFrom),
            until: formatDate(mandate.validUntil),
          })}
        </p>
        <DoctorMandatePolicyWarningList warnings={mandate.policyWarnings} />
        {isRevoked && mandate.revokedAt ? (
          <p className="text-xs break-words text-slate-500">
            {t('doctors.authorities.revokedOn', {
              date: format.dateTime(new Date(mandate.revokedAt), { dateStyle: 'medium' }),
              reason: mandate.revokeReason ?? '—',
            })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 @md/mandates:shrink-0 @md/mandates:flex-col @md/mandates:items-end">
        <DoctorMandateStatusBadge status={mandate.status} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="-ml-2 @md/mandates:ml-0"
          disabled={isDownloading}
          onClick={() => void handleDownload()}
        >
          <Icon name="download" size={16} />
          {t('doctors.mandates.downloadInstruction')}
        </Button>
        {canWrite && !isRevoked ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onRevoke(mandate)}>
            {t('doctors.authorities.revoke')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
