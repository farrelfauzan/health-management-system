'use client';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useBedsList } from '#lib/rooms/use-beds-list';

const FREE_BED_LIMIT = 100;

type BedPickerFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (bedId: string) => void;
  /** Excluded from the list — the bed the patient is already in. */
  excludedBedId?: string;
};

/**
 * The free-bed picker, shared by admit and transfer.
 *
 * It lists only AVAILABLE beds, which is a convenience and not the guard: the
 * API re-checks, and the partial unique index behind it settles the race when
 * two clerks pick the same bed from two stale lists.
 */
export function BedPickerField({
  id,
  label,
  value,
  onChange,
  excludedBedId,
}: BedPickerFieldProps) {
  const t = useTranslations('operations.admissions');
  const bedsQuery = useBedsList({ page: 1, limit: FREE_BED_LIMIT, status: 'AVAILABLE' });
  const beds = bedsQuery.beds.filter((bed) => bed.id !== excludedBedId);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t('bed')} />
        </SelectTrigger>
        <SelectContent>
          {beds.map((bed) => (
            <SelectItem key={bed.id} value={bed.id}>
              {bed.ward.name} / {bed.room.code} / {bed.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!bedsQuery.isPending && beds.length === 0 ? (
        <p className="text-sm text-warning">{t('noFreeBeds')}</p>
      ) : null}
    </div>
  );
}
