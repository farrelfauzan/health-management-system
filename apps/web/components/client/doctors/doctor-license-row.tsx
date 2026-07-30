'use client';

import type { DoctorLicense } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { LICENSE_EXPIRY_CLASSES, resolveLicenseExpiryStatus } from '#lib/doctors/license-expiry';

type DoctorLicenseRowProps = {
  license: DoctorLicense;
  today: Date;
};

export function DoctorLicenseRow({ license, today }: DoctorLicenseRowProps) {
  const status = resolveLicenseExpiryStatus(license.expiresAt, today);
  const t = useTranslations('clinical');
  const format = useFormatter();
  const formatDate = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {license.type} <span className="font-mono font-normal">{license.licenseNumber}</span>
        </p>
        <p className="text-xs text-slate-500">
          {license.issuedAt
            ? t('doctors.issued', { date: formatDate(license.issuedAt) })
            : t('doctors.issueDateMissing')}
          {license.expiresAt
            ? ` · ${t('doctors.expires', { date: formatDate(license.expiresAt) })}`
            : null}
        </p>
      </div>
      <Badge
        className={`shrink-0 rounded-full border-transparent text-[11px] font-medium ${LICENSE_EXPIRY_CLASSES[status]}`}
      >
        {t(`doctors.licenseStatus.${status}`)}
      </Badge>
    </li>
  );
}
