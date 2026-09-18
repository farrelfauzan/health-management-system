'use client';

import { useState } from 'react';
import type { DoctorAuthority, DoctorAuthorityDownloadView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { DoctorAuthorityStatusBadge } from '#components/client/doctors/doctor-authority-status-badge';
import { doctorAuthorityControllerGetGrantDocumentDownloadUrlV1 } from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

type DoctorAuthorityRowProps = {
  authority: DoctorAuthority;
  canWrite: boolean;
  onEdit: (authority: DoctorAuthority) => void;
  onRevoke: (authority: DoctorAuthority) => void;
};

/**
 * One authority inside `DoctorAuthoritiesCard`. Stacks details over actions in
 * a narrow card and puts the actions on the right once the `authorities`
 * container is at least `md` wide.
 */
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
        await doctorAuthorityControllerGetGrantDocumentDownloadUrlV1(
          authority.doctorId,
          authority.id,
        ),
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
    <li
      className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2 @md/authorities:flex-row @md/authorities:items-start @md/authorities:justify-between @md/authorities:gap-3"
      data-testid={`doctor-authority-${authority.kind}`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-slate-900">
          {t(`doctors.authorities.kind.${authority.kind}`)}
        </p>
        <p className="text-xs break-words text-slate-600">
          {t(`doctors.authorities.grantKind.${authority.grantKind}`)} ·{' '}
          <span className="font-mono">{authority.grantReference}</span>
        </p>
        <p className="text-xs text-slate-500">
          {t('doctors.authorities.validity.range', {
            from: formatDate(authority.validFrom),
            until: formatDate(authority.validUntil),
          })}
        </p>
        {isRevoked && authority.revokedAt ? (
          <p className="text-xs break-words text-slate-500">
            {t('doctors.authorities.revokedOn', {
              date: format.dateTime(new Date(authority.revokedAt), { dateStyle: 'medium' }),
              reason: authority.revokeReason ?? '—',
            })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 @md/authorities:shrink-0 @md/authorities:flex-col @md/authorities:items-end">
        <DoctorAuthorityStatusBadge status={authority.status} />
        {authority.hasGrantDocument ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="-ml-2 @md/authorities:ml-0"
            disabled={isDownloading}
            onClick={() => void handleDownload()}
          >
            <Icon name="download" size={16} />
            {t('doctors.authorities.downloadGrantDocument')}
          </Button>
        ) : (
          <span className="text-xs text-slate-400">{t('doctors.authorities.noGrantDocument')}</span>
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
    </li>
  );
}
