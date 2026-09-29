'use client';

import { ANALYTICS_PAYER_TYPES, type AnalyticsPayerTypeValue } from '@hms/shared-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

const ALL_VALUE = 'all';

type AnalyticsPayerSelectProps = {
  value?: AnalyticsPayerTypeValue;
  onChange: (payerType?: AnalyticsPayerTypeValue) => void;
};

/** Narrows the visit figures to one payer (P29-T07). */
export function AnalyticsPayerSelect({ value, onChange }: AnalyticsPayerSelectProps) {
  const t = useTranslations('analytics.filter');
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {t('payer')}
      <Select
        value={value ?? ALL_VALUE}
        onValueChange={(next) =>
          onChange(ANALYTICS_PAYER_TYPES.find((payerType) => payerType === next))
        }
      >
        <SelectTrigger className="w-40" aria-label={t('payer')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{t('allPayers')}</SelectItem>
          {ANALYTICS_PAYER_TYPES.map((payerType) => (
            <SelectItem key={payerType} value={payerType}>
              {t(`payerTypes.${payerType}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
