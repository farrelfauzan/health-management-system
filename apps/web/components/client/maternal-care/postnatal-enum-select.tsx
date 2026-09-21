'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';

type PostnatalEnumSelectProps = {
  id: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string | null) => void;
};

const NOT_EXAMINED = 'NOT_EXAMINED';

/** One coded nifas finding, with "not examined" as its empty answer (P25-T12). */
export function PostnatalEnumSelect({
  id,
  label,
  options,
  value,
  onChange,
}: PostnatalEnumSelectProps) {
  const t = useTranslations('maternalCare.postnatal.form');

  return (
    <div>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Select
        value={value ?? NOT_EXAMINED}
        onValueChange={(next) => onChange(next === NOT_EXAMINED ? null : next)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_EXAMINED}>{t('notExamined')}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
