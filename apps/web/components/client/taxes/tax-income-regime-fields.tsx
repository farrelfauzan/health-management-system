'use client';

import {
  INCOME_TAX_REGIMES,
  TAXPAYER_TYPES,
  resolvePp55Eligibility,
  type IncomeTaxRegimeValue,
  type TaxpayerTypeValue,
} from '@hms/shared-types';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FieldDescription } from '#components/client/shared/field-description';
import { FormLabel } from '#components/client/shared/form-label';
import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';

type TaxIncomeRegimeFieldsProps = {
  values: TaxSettingsFormValues;
  disabled: boolean;
  onChange: (change: Partial<TaxSettingsFormValues>) => void;
};

const FIELD_ID_PREFIX = 'tax-income-regime';

/**
 * Legal form and income-tax regime (P27-T02). Previews PP 55 eligibility under
 * PP 20/2026 as the administrator types, with the same rule the API applies on
 * save; the preview informs, the API decides.
 */
export function TaxIncomeRegimeFields({ values, disabled, onChange }: TaxIncomeRegimeFieldsProps) {
  const t = useTranslations('operations.taxes.settings');
  const isPp55 = values.incomeTaxRegime === 'PP55_FINAL';
  const startYear = Number.parseInt(values.pp55StartYear, 10);
  const eligibility = resolvePp55Eligibility({
    taxpayerType: values.taxpayerType === '' ? null : values.taxpayerType,
    startYear: Number.isNaN(startYear) ? null : startYear,
    currentYear: new Date().getFullYear(),
  });
  const eligibilityText = !eligibility.isEligible
    ? t('pp55.notEligible')
    : eligibility.lastEligibleYear === null
      ? t('pp55.unlimited')
      : t('pp55.lastYear', { year: eligibility.lastEligibleYear });

  return (
    <fieldset className="space-y-4">
      <legend className="font-heading text-sm font-semibold text-slate-900">
        {t('incomeTax.title')}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`${FIELD_ID_PREFIX}-type`}
            className="font-heading text-xs text-slate-600"
          >
            {t('incomeTax.taxpayerType')}
          </FormLabel>
          <Select
            value={values.taxpayerType}
            disabled={disabled}
            onValueChange={(value) => onChange({ taxpayerType: value as TaxpayerTypeValue })}
          >
            <SelectTrigger id={`${FIELD_ID_PREFIX}-type`} className="w-full">
              <SelectValue placeholder={t('incomeTax.taxpayerTypePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {TAXPAYER_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`taxpayerType.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`${FIELD_ID_PREFIX}-regime`}
            className="font-heading text-xs text-slate-600"
          >
            {t('incomeTax.regime')}
          </FormLabel>
          <Select
            value={values.incomeTaxRegime}
            disabled={disabled}
            onValueChange={(value) => onChange({ incomeTaxRegime: value as IncomeTaxRegimeValue })}
          >
            <SelectTrigger id={`${FIELD_ID_PREFIX}-regime`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INCOME_TAX_REGIMES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`regime.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isPp55 ? (
        <div className="space-y-1.5 sm:w-1/2">
          <FormLabel
            htmlFor={`${FIELD_ID_PREFIX}-start-year`}
            className="font-heading text-xs text-slate-600"
          >
            {t('incomeTax.pp55StartYear')}
          </FormLabel>
          <Input
            id={`${FIELD_ID_PREFIX}-start-year`}
            inputMode="numeric"
            value={values.pp55StartYear}
            disabled={disabled}
            aria-describedby={`${FIELD_ID_PREFIX}-eligibility`}
            onChange={(event) => onChange({ pp55StartYear: event.target.value })}
          />
          <FieldDescription id={`${FIELD_ID_PREFIX}-eligibility`}>
            {eligibilityText}
          </FieldDescription>
        </div>
      ) : null}
    </fieldset>
  );
}
