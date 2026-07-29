'use client';

import type { PatientDetail } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';
import {
  EMPTY_VALUE,
  formatBloodType,
  formatGuardian,
  formatOptionalLabel,
} from '#lib/patients/format-patient-fields';
import { computePatientAge } from '#lib/patients/patient-age';
import { formatPatientSexLabel } from '#lib/patients/patient-sex-label';
import { formatPatientStatusLabel } from '#lib/patients/patient-status-label';
import { formatMediumDate } from '#lib/shared/format-medium-date';

type PatientDemographicsCardProps = {
  patient: PatientDetail;
};

export function PatientDemographicsCard({ patient }: PatientDemographicsCardProps) {
  const fields: Array<{ label: string; value: React.ReactNode; isMono?: boolean }> = [
    { label: 'Patient ID (MRN)', value: patient.mrn, isMono: true },
    { label: 'Sex', value: formatPatientSexLabel(patient.sex) },
    {
      label: 'Date of Birth',
      value: `${formatMediumDate(patient.dateOfBirth)} (${computePatientAge(patient.dateOfBirth)} yrs)`,
    },
    { label: 'Place of Birth', value: patient.placeOfBirth ?? EMPTY_VALUE },
    { label: 'Phone Number', value: patient.phoneNumber, isMono: true },
    { label: 'Email', value: patient.email ?? EMPTY_VALUE },
    { label: 'Address', value: patient.address },
    { label: 'Blood Type', value: formatBloodType(patient.bloodType, patient.rhesusFactor) },
    { label: 'Marital Status', value: formatOptionalLabel(patient.maritalStatus) },
    { label: 'Religion', value: formatOptionalLabel(patient.religion) },
    { label: 'Occupation', value: patient.occupation ?? EMPTY_VALUE },
    { label: 'Emergency Contact', value: patient.emergencyContactName ?? EMPTY_VALUE },
    {
      label: 'Emergency Phone',
      value: patient.emergencyContactPhone ?? EMPTY_VALUE,
      isMono: Boolean(patient.emergencyContactPhone),
    },
    { label: 'Guardian', value: formatGuardian(patient.guardianName, patient.guardianRelation) },
    {
      label: 'Status',
      value: (
        <StatusBadge status={patient.status} label={formatPatientStatusLabel(patient.status)} />
      ),
    },
    { label: 'Registered', value: formatMediumDate(patient.createdAt) },
    { label: 'Last Updated', value: formatMediumDate(patient.updatedAt) },
  ];

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Demographics
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
