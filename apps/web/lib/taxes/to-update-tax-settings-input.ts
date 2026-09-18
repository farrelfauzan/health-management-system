import type { UpdateTaxSettingsInput } from '@hms/shared-types';

import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';

type ToUpdateTaxSettingsInputParams = {
  values: TaxSettingsFormValues;
  initial: TaxSettingsFormValues;
};

/**
 * The form as a PATCH naming only what the administrator changed. Sending
 * everything would make the API re-judge rules nobody touched — a PP 55 period
 * that ended last year would then block a change of pricing mode. Blanks
 * become `null`, which clears them.
 */
export function toUpdateTaxSettingsInput({
  values,
  initial,
}: ToUpdateTaxSettingsInputParams): UpdateTaxSettingsInput {
  const next = toWireValues(values);
  const previous = toWireValues(initial);
  return Object.fromEntries(
    Object.entries(next).filter(
      ([field, value]) => previous[field as keyof UpdateTaxSettingsInput] !== value,
    ),
  ) as UpdateTaxSettingsInput;
}

function toWireValues(values: TaxSettingsFormValues): Required<UpdateTaxSettingsInput> {
  const startYear = values.pp55StartYear.trim();
  const nitku = values.nitku.trim();
  return {
    taxpayerType: values.taxpayerType === '' ? null : values.taxpayerType,
    incomeTaxRegime: values.incomeTaxRegime,
    pp55StartYear:
      values.incomeTaxRegime === 'PP55_FINAL' && startYear !== '' ? Number(startYear) : null,
    isPkp: values.isPkp,
    pkpSince: values.isPkp && values.pkpSince !== '' ? values.pkpSince : null,
    nitku: nitku === '' ? null : nitku,
    pricesIncludeTax: values.pricesIncludeTax,
  };
}
