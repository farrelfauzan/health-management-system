'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDoctorCredentialOptions } from '#lib/doctors/use-doctor-credential-options';

const NO_TITLE_VALUE = '__none__';

type DoctorTitleSelectProps = {
  id?: string;
  /** The TITLE option code, or `''` when the doctor has no title on file. */
  value: string;
  /** Raw stored text that matched no option, kept selectable so it is not lost. */
  legacyValue?: string;
  disabled?: boolean;
  onChange: (code: string) => void;
};

export function DoctorTitleSelect({
  id,
  value,
  legacyValue,
  disabled = false,
  onChange,
}: DoctorTitleSelectProps) {
  const t = useTranslations('clinical');
  const { options, isPending } = useDoctorCredentialOptions({ kind: 'TITLE' });
  return (
    <Select
      value={value === '' ? NO_TITLE_VALUE : value}
      disabled={disabled || isPending}
      onValueChange={(next) => onChange(next === NO_TITLE_VALUE ? '' : next)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue
          placeholder={
            legacyValue ? t('doctors.credentials.legacyValue', { value: legacyValue }) : undefined
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TITLE_VALUE}>{t('doctors.credentials.noTitle')}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.code}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
