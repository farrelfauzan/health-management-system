'use client';

import { PAYER_TYPES, type PayerTypeValue } from '@hms/shared-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

type PayerTypeSelectProps = {
  id: string;
  value: PayerTypeValue | undefined;
  onChange: (value: PayerTypeValue) => void;
  disabled?: boolean;
};

function isPayerType(value: string): value is PayerTypeValue {
  return (PAYER_TYPES as readonly string[]).includes(value);
}

/**
 * Who pays for a visit (P29-T07): general, BPJS or insurance. It starts empty
 * on purpose, because a default would record a guess as a fact.
 */
export function PayerTypeSelect({ id, value, onChange, disabled = false }: PayerTypeSelectProps) {
  const t = useTranslations('operations.registrations.payer');
  return (
    <Select
      value={value ?? ''}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (isPayerType(nextValue)) {
          onChange(nextValue);
        }
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {PAYER_TYPES.map((payerType) => (
          <SelectItem key={payerType} value={payerType}>
            {t(`types.${payerType}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
