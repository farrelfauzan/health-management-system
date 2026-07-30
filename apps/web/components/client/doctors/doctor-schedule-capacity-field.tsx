'use client';

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

const DEFAULT_LIMITED_CAPACITY = 10;

type DoctorScheduleCapacityFieldProps = {
  index: number;
  maxPatients: number | null | undefined;
  onChange: (maxPatients: number | null) => void;
};

export function DoctorScheduleCapacityField({
  index,
  maxPatients,
  onChange,
}: DoctorScheduleCapacityFieldProps) {
  const t = useTranslations('clinical');
  const isLimited = maxPatients !== null && maxPatients !== undefined;

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={isLimited ? 'limited' : 'unlimited'}
        onValueChange={(value) => onChange(value === 'limited' ? DEFAULT_LIMITED_CAPACITY : null)}
      >
        <SelectTrigger
          className="w-28"
          aria-label={t('doctors.scheduleFields.capacityMode', { index: index + 1 })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unlimited">{t('doctors.scheduleFields.unlimited')}</SelectItem>
          <SelectItem value="limited">{t('doctors.scheduleFields.limited')}</SelectItem>
        </SelectContent>
      </Select>
      {isLimited ? (
        <Input
          type="number"
          min={1}
          className="w-20"
          aria-label={t('doctors.scheduleFields.maxPatients', { index: index + 1 })}
          value={String(maxPatients)}
          onChange={(event) => {
            const parsedValue = Number(event.target.value);
            onChange(Number.isNaN(parsedValue) || parsedValue < 1 ? 1 : parsedValue);
          }}
        />
      ) : null}
    </div>
  );
}
