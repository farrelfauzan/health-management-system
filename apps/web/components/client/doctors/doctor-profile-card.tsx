'use client';

import type { DoctorDetail } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';
import { EMPTY_VALUE } from '#lib/shared/empty-value';
import { formatMediumDate } from '#lib/shared/format-medium-date';

type DoctorProfileCardProps = {
  doctor: DoctorDetail;
};

export function DoctorProfileCard({ doctor }: DoctorProfileCardProps) {
  const fields: Array<{ label: string; value: React.ReactNode; isMono?: boolean }> = [
    { label: 'License Number', value: doctor.licenseNumber, isMono: true },
    { label: 'Specialty', value: doctor.specialty },
    { label: 'Title', value: doctor.title ?? EMPTY_VALUE },
    { label: 'Degrees', value: doctor.degrees ?? EMPTY_VALUE },
    { label: 'Phone Number', value: doctor.phoneNumber ?? '-', isMono: true },
    { label: 'Email', value: doctor.email ?? EMPTY_VALUE },
    { label: 'Assigned Patients', value: doctor.patientCount, isMono: true },
    {
      label: 'Status',
      value: <StatusBadge status={doctor.isActive ? 'active' : 'inactive'} />,
    },
    { label: 'Registered', value: formatMediumDate(doctor.createdAt) },
    { label: 'Last Updated', value: formatMediumDate(doctor.updatedAt) },
  ];

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Profile
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="space-y-1">
              <dt className="font-heading text-xs font-medium uppercase tracking-wide text-slate-500">
                {field.label}
              </dt>
              <dd className={field.isMono ? 'font-mono text-sm text-slate-700' : 'text-sm text-slate-700'}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
