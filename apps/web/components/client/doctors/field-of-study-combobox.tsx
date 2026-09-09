'use client';

import { Combobox } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDoctorCredentialOptions } from '#lib/doctors/use-doctor-credential-options';

type FieldOfStudyComboboxProps = {
  id?: string;
  /** The FIELD_OF_STUDY option code, or `''` when none is chosen. */
  value: string;
  disabled?: boolean;
  onChange: (code: string) => void;
};

export function FieldOfStudyCombobox({
  id,
  value,
  disabled = false,
  onChange,
}: FieldOfStudyComboboxProps) {
  const t = useTranslations('clinical');
  const { options, isPending } = useDoctorCredentialOptions({ kind: 'FIELD_OF_STUDY' });
  return (
    <Combobox
      id={id}
      options={options.map((option) => ({ value: option.code, label: option.label }))}
      value={value}
      placeholder={t('doctors.credentials.selectField')}
      searchPlaceholder={t('doctors.credentials.searchField')}
      emptyMessage={t('doctors.credentials.noFieldMatch')}
      emptyOptionLabel={t('doctors.credentials.noField')}
      isLoading={isPending}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
