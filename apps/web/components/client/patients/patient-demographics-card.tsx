'use client';

import type { PatientDetail } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import {
  formatBloodType,
  formatGuardian,
  formatOptionalLabel,
} from '#lib/patients/format-patient-fields';
import { computePatientAge } from '#lib/patients/patient-age';
import { EMPTY_VALUE } from '#lib/shared/empty-value';

type PatientDemographicsCardProps = {
  patient: PatientDetail;
};

export function PatientDemographicsCard({ patient }: PatientDemographicsCardProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const formatDate = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });
  const fields: Array<{ label: string; value: React.ReactNode; isMono?: boolean }> = [
    { label: t('patients.demographics.patientId'), value: patient.mrn, isMono: true },
    { label: t('patients.demographics.sex'), value: t(`patients.sex.${patient.sex ?? 'UNKNOWN'}`) },
    {
      label: t('patients.demographics.birthDate'),
      value: `${formatDate(patient.dateOfBirth)} (${t('common.years', { count: computePatientAge(patient.dateOfBirth) })})`,
    },
    { label: t('patients.demographics.birthPlace'), value: patient.placeOfBirth ?? EMPTY_VALUE },
    { label: t('patients.demographics.phone'), value: patient.phoneNumber, isMono: true },
    { label: t('patients.demographics.email'), value: patient.email ?? EMPTY_VALUE },
    { label: t('patients.demographics.address'), value: patient.address },
    {
      label: t('patients.demographics.bloodType'),
      value: formatBloodType(patient.bloodType, patient.rhesusFactor),
    },
    {
      label: t('patients.demographics.maritalStatus'),
      value: formatOptionalLabel(patient.maritalStatus),
    },
    { label: t('patients.demographics.religion'), value: formatOptionalLabel(patient.religion) },
    { label: t('patients.demographics.occupation'), value: patient.occupation ?? EMPTY_VALUE },
    {
      label: t('patients.demographics.emergencyContact'),
      value: patient.emergencyContactName ?? EMPTY_VALUE,
    },
    {
      label: t('patients.demographics.emergencyPhone'),
      value: patient.emergencyContactPhone ?? EMPTY_VALUE,
      isMono: Boolean(patient.emergencyContactPhone),
    },
    {
      label: t('patients.demographics.guardian'),
      value: formatGuardian(patient.guardianName, patient.guardianRelation),
    },
    {
      label: t('common.status'),
      value: <StatusBadge status={patient.status} label={t(`patients.status.${patient.status}`)} />,
    },
    { label: t('patients.demographics.registered'), value: formatDate(patient.createdAt) },
    { label: t('patients.demographics.updated'), value: formatDate(patient.updatedAt) },
  ];

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('patients.demographics.title')}
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
