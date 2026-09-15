'use client';

import { useState } from 'react';
import type { DoctorAuthority, DoctorAuthorityDownloadView } from '@hms/shared-types';
import { Button, Icon, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { DoctorAuthorityStatusBadge } from '#components/client/doctors/doctor-authority-status-badge';
import { doctorAuthorityControllerGetDecreeDownloadUrlV1 } from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

type DoctorAuthorityRowProps = {
  authority: DoctorAuthority;
  canWrite: boolean;
  onEdit: (authority: DoctorAuthority) => void;
  onRevoke: (authority: DoctorAuthority) => void;
};

export function DoctorAuthorityRow({
  authority,
  canWrite,
  onEdit,
  onRevoke,
}: DoctorAuthorityRowProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const formatDate = (value: string): string =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const isRevoked = authority.status === 'REVOKED';

  async function handleDownload(): Promise<void> {
    setIsDownloading(true);
    try {
      const response = parseApiSuccess<DoctorAuthorityDownloadView>(
        await doctorAuthorityControllerGetDecreeDownloadUrlV1(authority.doctorId, authority.id),
        t('doctors.authorities.downloadError'),
      );
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyApiError(error, t('doctors.authorities.downloadError'));
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <TableRow data-testid={`doctor-authority-${authority.kind}`}>
      <TableCell className="align-top whitespace-normal">
        <p className="text-sm font-medium text-slate-900">
          {t(`doctors.authorities.kind.${authority.kind}`)}
        </p>
        <p className="font-mono text-xs text-slate-600">{authority.decreeNumber}</p>
        <p className="text-xs text-slate-500">
          {authority.validUntil
            ? t('doctors.authorities.validity.range', {
                from: formatDate(authority.validFrom),
                until: formatDate(authority.validUntil),
              })
            : t('doctors.authorities.validity.openEnded', {
                from: formatDate(authority.validFrom),
              })}
        </p>
        {isRevoked && authority.revokedAt ? (
          <p className="text-xs text-slate-500">
            {t('doctors.authorities.revokedOn', {
              date: format.dateTime(new Date(authority.revokedAt), { dateStyle: 'medium' }),
              reason: authority.revokeReason ?? '—',
            })}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col items-end gap-1.5">
          <DoctorAuthorityStatusBadge status={authority.status} />
          {authority.hasDecree ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isDownloading}
              onClick={() => void handleDownload()}
            >
              <Icon name="download" size={16} />
              {t('doctors.authorities.downloadDecree')}
            </Button>
          ) : (
            <span className="text-xs text-slate-400">{t('doctors.authorities.noDecree')}</span>
          )}
          {canWrite && !isRevoked ? (
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => onEdit(authority)}>
                {t('doctors.authorities.edit')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onRevoke(authority)}>
                {t('doctors.authorities.revoke')}
              </Button>
            </div>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
