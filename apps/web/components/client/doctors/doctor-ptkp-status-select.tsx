'use client';

import { CLINICIAN_PTKP_STATUSES, type ClinicianPtkpStatusValue } from '@hms/shared-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

const NO_STATUS_VALUE = '__none__';

type DoctorPtkpStatusSelectProps = {
  id?: string;
  /** The stored status, or `''` when none is recorded. */
  value: ClinicianPtkpStatusValue | '';
  describedBy?: string;
  onChange: (status: ClinicianPtkpStatusValue | '') => void;
};

/**
 * The clinician's PTKP status (P27-T08), which DJP's BP21 template requires
 * on every line of the Coretax file. "Not recorded" clears it.
 */
export function DoctorPtkpStatusSelect({
  id,
  value,
  describedBy,
  onChange,
}: DoctorPtkpStatusSelectProps) {
  const t = useTranslations('clinical');
  return (
    <Select
      value={value === '' ? NO_STATUS_VALUE : value}
      onValueChange={(next) =>
        onChange(next === NO_STATUS_VALUE ? '' : (next as ClinicianPtkpStatusValue))
      }
    >
      <SelectTrigger id={id} className="w-full" aria-describedby={describedBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_STATUS_VALUE}>{t('doctors.form.ptkpStatusNone')}</SelectItem>
        {CLINICIAN_PTKP_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {t(`doctors.ptkpStatuses.${status}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
