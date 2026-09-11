'use client';

import type { ReactNode } from 'react';
import type { DoctorDetail } from '@hms/shared-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { EMPTY_VALUE } from '#lib/shared/empty-value';

type OwnDoctorProfileClinicCardProps = {
  doctor: DoctorDetail;
};

/**
 * What the clinic asserts about the doctor, shown but not editable (D-025):
 * credentials and national identity decide what prints on a prescription and
 * which SATUSEHAT record an encounter lands in, so a change goes through an
 * administrator rather than a form the doctor can submit.
 */
export function OwnDoctorProfileClinicCard({ doctor }: OwnDoctorProfileClinicCardProps) {
  const t = useTranslations('clinical');
  const fields: Array<{ label: string; value: ReactNode; isMono?: boolean }> = [
    { label: t('ownProfile.fields.license'), value: doctor.licenseNumber, isMono: true },
    { label: t('ownProfile.fields.specialty'), value: doctor.specialty },
    {
      label: t('ownProfile.fields.email'),
      value: (
        <span className="flex flex-wrap items-center gap-2">
          {doctor.email ?? EMPTY_VALUE}
          {doctor.invitationStatus ? <StatusBadge status={doctor.invitationStatus} /> : null}
        </span>
      ),
    },
    { label: t('ownProfile.fields.nik'), value: doctor.nikMasked ?? EMPTY_VALUE, isMono: true },
    {
      label: t('ownProfile.fields.satusehat'),
      value: doctor.satusehatPractitionerId ?? EMPTY_VALUE,
      isMono: true,
    },
  ];
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('ownProfile.clinicManagedTitle')}
        </CardTitle>
        <CardDescription>{t('ownProfile.clinicManagedDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-y-4">
          {fields.map((field) => (
            <div key={field.label} className="space-y-1">
              <dt className="font-heading text-xs font-medium uppercase tracking-wide text-slate-500">
                {field.label}
              </dt>
              <dd
                className={
                  field.isMono ? 'font-mono text-sm text-slate-700' : 'text-sm text-slate-700'
                }
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
