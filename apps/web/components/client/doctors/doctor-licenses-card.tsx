'use client';

import type { DoctorLicense } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';

import { DoctorLicenseRow } from '#components/client/doctors/doctor-license-row';
import { resolveLicenseExpiryStatus } from '#lib/doctors/license-expiry';

type DoctorLicensesCardProps = {
  licenses: DoctorLicense[];
};

export function DoctorLicensesCard({ licenses }: DoctorLicensesCardProps) {
  // Read the clock once per render so every row is judged against the same
  // instant — rows evaluated at different moments could disagree.
  const today = new Date();
  const attentionCount = licenses.filter((license) => {
    const status = resolveLicenseExpiryStatus(license.expiresAt, today);
    return status === 'EXPIRED' || status === 'EXPIRING_SOON';
  }).length;

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          Licences (STR / SIP)
          {attentionCount > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning">
              <Icon name="warning" size={14} />
              {attentionCount} need attention
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {licenses.length > 0 ? (
          <ul className="space-y-2">
            {licenses.map((license) => (
              <DoctorLicenseRow key={license.id} license={license} today={today} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            No licence recorded. A practising doctor needs an STR, and a SIP per practice location.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
