'use client';

import type { Specialty } from '@hms/shared-types';
import { Combobox } from '@hms/ui';
import { useTranslations } from 'next-intl';

type SpecialtyComboboxProps = {
  id?: string;
  specialties: Specialty[];
  value: string;
  isLoading?: boolean;
  hasError?: boolean;
  emptyOptionLabel?: string;
  onChange: (specialtyId: string) => void;
};

export function SpecialtyCombobox({
  id,
  specialties,
  value,
  isLoading = false,
  hasError = false,
  emptyOptionLabel,
  onChange,
}: SpecialtyComboboxProps) {
  const t = useTranslations('clinical');
  return (
    <Combobox
      id={id}
      options={specialties.map((specialty) => ({ value: specialty.id, label: specialty.name }))}
      value={value}
      placeholder={t('doctors.selectSpecialty')}
      searchPlaceholder={t('doctors.searchSpecialty')}
      emptyMessage={t('doctors.noSpecialty')}
      emptyOptionLabel={emptyOptionLabel}
      isLoading={isLoading}
      hasError={hasError}
      onChange={onChange}
    />
  );
}
