'use client';

import { DatePicker, Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import type { TaxRateFormValues } from '#lib/taxes/tax-rate-form-values';

type TaxRateFieldsProps = {
  idPrefix: string;
  values: TaxRateFormValues;
  disabled: boolean;
  onChange: (change: Partial<TaxRateFormValues>) => void;
};

/**
 * The four numbers of a rate (P27-T03): the percentage, the DPP fraction
 * (11/12 for DPP nilai lain) and the day it takes effect.
 */
export function TaxRateFields({ idPrefix, values, disabled, onChange }: TaxRateFieldsProps) {
  const t = useTranslations('operations.taxes.codes.rate');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <FormLabel htmlFor={`${idPrefix}-percent`} required>
          {t('ratePercent')}
        </FormLabel>
        <Input
          id={`${idPrefix}-percent`}
          inputMode="decimal"
          value={values.ratePercent}
          disabled={disabled}
          onChange={(event) => onChange({ ratePercent: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <FormLabel htmlFor={`${idPrefix}-from`} required>
          {t('effectiveFrom')}
        </FormLabel>
        <DatePicker
          id={`${idPrefix}-from`}
          value={values.effectiveFrom}
          disabled={disabled}
          onValueChange={(value) => onChange({ effectiveFrom: value })}
        />
      </div>
      <div className="space-y-1">
        <FormLabel htmlFor={`${idPrefix}-numerator`} required>
          {t('dppNumerator')}
        </FormLabel>
        <Input
          id={`${idPrefix}-numerator`}
          inputMode="numeric"
          value={values.dppNumerator}
          disabled={disabled}
          onChange={(event) => onChange({ dppNumerator: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <FormLabel htmlFor={`${idPrefix}-denominator`} required>
          {t('dppDenominator')}
        </FormLabel>
        <Input
          id={`${idPrefix}-denominator`}
          inputMode="numeric"
          value={values.dppDenominator}
          disabled={disabled}
          onChange={(event) => onChange({ dppDenominator: event.target.value })}
        />
      </div>
      <p className="text-xs text-slate-500 sm:col-span-2">{t('hint')}</p>
    </div>
  );
}
