'use client';

import type { DoctorLicense } from '@hms/shared-types';
import { Badge } from '@hms/ui';

import {
  LICENSE_EXPIRY_CLASSES,
  LICENSE_EXPIRY_LABELS,
  resolveLicenseExpiryStatus,
} from '#lib/doctors/license-expiry';
import { formatMediumDate } from '#lib/shared/format-medium-date';

type DoctorLicenseRowProps = {
  license: DoctorLicense;
  today: Date;
};

export function DoctorLicenseRow({ license, today }: DoctorLicenseRowProps) {
  const status = resolveLicenseExpiryStatus(license.expiresAt, today);

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {license.type} <span className="font-mono font-normal">{license.licenseNumber}</span>
        </p>
        <p className="text-xs text-slate-500">
          {license.issuedAt ? `Issued ${formatMediumDate(license.issuedAt)}` : 'Issue date not recorded'}
          {license.expiresAt ? ` · Expires ${formatMediumDate(license.expiresAt)}` : null}
        </p>
      </div>
      <Badge
        className={`shrink-0 rounded-full border-transparent text-[11px] font-medium ${LICENSE_EXPIRY_CLASSES[status]}`}
      >
        {LICENSE_EXPIRY_LABELS[status]}
      </Badge>
    </li>
  );
}
