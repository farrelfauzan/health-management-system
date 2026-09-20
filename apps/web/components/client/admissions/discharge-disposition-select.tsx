'use client';

import { DISCHARGE_DISPOSITIONS, type DischargeDispositionValue } from '@hms/shared-types';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

type DischargeDispositionSelectProps = {
  value: DischargeDispositionValue | '';
  onValueChange: (value: DischargeDispositionValue) => void;
};

/**
 * How the stay ended (P24-T08, FR-IP-02). Required: every stay before this
 * field existed was reported to SATUSEHAT as discharged home (D-030), and a
 * disposition nobody has to pick would leave that guess in place.
 */
export function DischargeDispositionSelect({
  value,
  onValueChange,
}: DischargeDispositionSelectProps) {
  const t = useTranslations('operations.admissions');
  return (
    <div className="space-y-2">
      <Label htmlFor="discharge-disposition">{t('dischargeDisposition')}</Label>
      <Select
        value={value}
        onValueChange={(selected) => onValueChange(selected as DischargeDispositionValue)}
      >
        <SelectTrigger id="discharge-disposition" aria-label={t('dischargeDisposition')}>
          <SelectValue placeholder={t('dischargeDispositionPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {DISCHARGE_DISPOSITIONS.map((disposition) => (
            <SelectItem key={disposition} value={disposition}>
              {t(`dischargeDispositions.${disposition}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
