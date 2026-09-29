'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

const ALL_VALUE = 'all';

type AnalyticsPoliSelectProps = {
  value?: string;
  onChange: (specialtyId?: string) => void;
};

/** Narrows every block to one poli. Lists inactive poli too: history does not expire. */
export function AnalyticsPoliSelect({ value, onChange }: AnalyticsPoliSelectProps) {
  const t = useTranslations('analytics.filter');
  const { specialties } = useSpecialtiesList();
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {t('poli')}
      <Select
        value={value ?? ALL_VALUE}
        onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : next)}
      >
        <SelectTrigger className="w-40" aria-label={t('poli')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{t('allPoli')}</SelectItem>
          {specialties.map((specialty) => (
            <SelectItem key={specialty.id} value={specialty.id}>
              {specialty.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
