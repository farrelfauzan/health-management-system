'use client';

import { MultiCombobox } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDoctorCredentialOptions } from '#lib/doctors/use-doctor-credential-options';

type DoctorDegreesPickerProps = {
  id?: string;
  /** DEGREE option codes, in the order they should print after the name. */
  values: string[];
  disabled?: boolean;
  onChange: (codes: string[]) => void;
};

/**
 * Order is the doctor's own — a specialist credential precedes an academic one
 * on an Indonesian signature block — and `MultiCombobox` already appends each
 * pick to the end of `values` rather than sorting by the option list, so the
 * chips read in exactly the order they were chosen and are stored that way.
 */
export function DoctorDegreesPicker({
  id,
  values,
  disabled = false,
  onChange,
}: DoctorDegreesPickerProps) {
  const t = useTranslations('clinical');
  const { options, isPending } = useDoctorCredentialOptions({ kind: 'DEGREE' });
  return (
    <MultiCombobox
      id={id}
      options={options.map((option) => ({ value: option.code, label: option.label }))}
      values={values}
      placeholder={t('doctors.credentials.selectDegrees')}
      searchPlaceholder={t('doctors.credentials.searchDegrees')}
      emptyMessage={t('doctors.credentials.noDegreeMatch')}
      isLoading={isPending}
      disabled={disabled}
      removeLabel={(label) => t('doctors.credentials.removeDegree', { label })}
      onChange={onChange}
    />
  );
}
