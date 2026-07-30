'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import { MAX_INITIAL_DOCTOR_ASSIGNMENTS } from '@hms/shared-types';
import { Checkbox, Skeleton } from '@hms/ui';

type PatientDoctorPickerProps = {
  doctors: DoctorListItem[];
  selectedDoctorIds: string[];
  isLoading: boolean;
  onToggleDoctor: (doctorId: string) => void;
};

export function PatientDoctorPicker({
  doctors,
  selectedDoctorIds,
  isLoading,
  onToggleDoctor,
}: PatientDoctorPickerProps) {
  const t = useTranslations('clinical');
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }
  if (doctors.length === 0) {
    return <p className="text-sm text-slate-500">{t('patients.noActiveDoctors')}</p>;
  }
  const isAtLimit = selectedDoctorIds.length >= MAX_INITIAL_DOCTOR_ASSIGNMENTS;
  return (
    <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
      {doctors.map((doctor) => {
        const isSelected = selectedDoctorIds.includes(doctor.id);
        return (
          <label key={doctor.id} className="flex cursor-pointer items-center gap-2.5">
            <Checkbox
              checked={isSelected}
              disabled={!isSelected && isAtLimit}
              onCheckedChange={() => onToggleDoctor(doctor.id)}
            />
            <span className="text-sm text-slate-700">{doctor.fullName}</span>
            <span className="text-xs text-slate-400">{doctor.specialty}</span>
          </label>
        );
      })}
    </div>
  );
}
