'use client';

import type { DoctorDetail } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { EMPTY_VALUE } from '#lib/shared/empty-value';

type DoctorProfileCardProps = {
  doctor: DoctorDetail;
};

export function DoctorProfileCard({ doctor }: DoctorProfileCardProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const formatDate = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });
  const fields: Array<{ label: string; value: React.ReactNode; isMono?: boolean }> = [
    { label: t('doctors.license'), value: doctor.licenseNumber, isMono: true },
    { label: t('doctors.specialty'), value: doctor.specialty },
    { label: t('doctors.titleLabel'), value: doctor.title ?? EMPTY_VALUE },
    { label: t('doctors.degrees'), value: doctor.degrees ?? EMPTY_VALUE },
    { label: t('doctors.phone'), value: doctor.phoneNumber ?? '-', isMono: true },
    // Read from the linked account: a doctor with no login has no address.
    { label: t('doctors.email'), value: doctor.email ?? EMPTY_VALUE },
    {
      label: t('doctors.assignedPatients'),
      value: format.number(doctor.patientCount),
      isMono: true,
    },
    {
      label: t('common.status'),
      value: (
        <StatusBadge
          status={doctor.isActive ? 'active' : 'inactive'}
          label={t(doctor.isActive ? 'common.active' : 'common.inactive')}
        />
      ),
    },
    { label: t('doctors.registered'), value: formatDate(doctor.createdAt) },
    { label: t('doctors.updated'), value: formatDate(doctor.updatedAt) },
  ];

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('doctors.profile')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
