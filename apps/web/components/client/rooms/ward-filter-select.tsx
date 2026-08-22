'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useWardsList } from '#lib/rooms/use-wards-list';

const WARD_OPTIONS_LIMIT = 100;

const ALL_WARDS_VALUE = 'all';

type WardFilterSelectProps = {
  value: string | undefined;
  onChange: (wardId: string | undefined) => void;
};

/**
 * The ward filter shared by the rooms, beds and admissions tables. One
 * component because all three ask the same question of the same list, and a
 * second copy is how "All wards" ends up meaning two different things.
 */
export function WardFilterSelect({ value, onChange }: WardFilterSelectProps) {
  const t = useTranslations('operations.rooms');
  const wardsQuery = useWardsList({ page: 1, limit: WARD_OPTIONS_LIMIT, isActive: 'true' });

  return (
    <Select
      value={value ?? ALL_WARDS_VALUE}
      onValueChange={(nextValue) =>
        onChange(nextValue === ALL_WARDS_VALUE ? undefined : nextValue)
      }
    >
      <SelectTrigger className="w-56" aria-label={t('ward')}>
        <SelectValue placeholder={t('allWards')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_WARDS_VALUE}>{t('allWards')}</SelectItem>
        {wardsQuery.wards.map((ward) => (
          <SelectItem key={ward.id} value={ward.id}>
            {ward.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
