'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { Combobox } from '@hms/ui';
import { useTranslations } from 'next-intl';

type DoctorComboboxProps = {
  id?: string;
  doctors: DoctorListItem[];
  value: string;
  isLoading?: boolean;
  hasError?: boolean;
  emptyOptionLabel?: string;
  onChange: (doctorId: string) => void;
};

export function DoctorCombobox({
  id,
  doctors,
  value,
  isLoading = false,
  hasError = false,
  emptyOptionLabel,
  onChange,
}: DoctorComboboxProps) {
  const t = useTranslations('clinical');
  return (
    <Combobox
      id={id}
      options={doctors.map((doctor) => ({
        value: doctor.id,
        label: `${doctor.fullName} (${doctor.specialty})`,
      }))}
      value={value}
      placeholder={t('doctors.selectDoctor')}
      searchPlaceholder={t('doctors.searchDoctor')}
      emptyMessage={t('doctors.noDoctor')}
      emptyOptionLabel={emptyOptionLabel}
      isLoading={isLoading}
      hasError={hasError}
      onChange={onChange}
    />
  );
}
