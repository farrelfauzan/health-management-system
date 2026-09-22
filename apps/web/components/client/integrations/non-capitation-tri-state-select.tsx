'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TRI_STATE_VALUES, type TriStateValue } from '#lib/bpjs-non-capitation/tri-state-value';

type NonCapitationTriStateSelectProps = {
  id: string;
  value: TriStateValue;
  describedBy: string;
  onValueChange: (value: TriStateValue) => void;
};

/** Yes, no, or not known yet — a Q12 answer that may still be missing (P25-T16). */
export function NonCapitationTriStateSelect({
  id,
  value,
  describedBy,
  onValueChange,
}: NonCapitationTriStateSelectProps) {
  const t = useTranslations('operations.integrations.nonCapitation.settings');

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as TriStateValue)}>
      <SelectTrigger id={id} aria-describedby={describedBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRI_STATE_VALUES.map((option) => (
          <SelectItem key={option} value={option}>
            {t(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
