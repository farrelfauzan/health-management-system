'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDoctorsList } from '#lib/doctors/use-doctors-list';

const ALL_VALUE = 'all';
const DOCTOR_OPTION_LIMIT = 100;

type AnalyticsDoctorSelectProps = {
  value?: string;
  specialtyId?: string;
  onChange: (doctorId?: string) => void;
};

/** Narrows every block to one clinician, listing only the chosen poli's clinicians. */
export function AnalyticsDoctorSelect({
  value,
  specialtyId,
  onChange,
}: AnalyticsDoctorSelectProps) {
  const t = useTranslations('analytics.filter');
  const { doctors } = useDoctorsList({ page: 1, limit: DOCTOR_OPTION_LIMIT, specialtyId });
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {t('doctor')}
      <Select
        value={value ?? ALL_VALUE}
        onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : next)}
      >
        <SelectTrigger className="w-44" aria-label={t('doctor')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{t('allDoctors')}</SelectItem>
          {doctors.map((doctor) => (
            <SelectItem key={doctor.id} value={doctor.id}>
              {doctor.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
