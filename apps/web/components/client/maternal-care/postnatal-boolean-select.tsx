'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';

type PostnatalBooleanSelectProps = {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
};

const NOT_EXAMINED = 'NOT_EXAMINED';

/**
 * A yes / no / not examined answer (P25-T12). Three states rather than a
 * checkbox: an unticked box would read as "no" to SATUSEHAT when the finding
 * was simply not examined.
 */
export function PostnatalBooleanSelect({ id, label, value, onChange }: PostnatalBooleanSelectProps) {
  const t = useTranslations('maternalCare.postnatal.form');
  const selected = value === null ? NOT_EXAMINED : String(value);

  return (
    <div>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Select
        value={selected}
        onValueChange={(next) => onChange(next === NOT_EXAMINED ? null : next === 'true')}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_EXAMINED}>{t('notExamined')}</SelectItem>
          <SelectItem value="true">{t('yes')}</SelectItem>
          <SelectItem value="false">{t('no')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
