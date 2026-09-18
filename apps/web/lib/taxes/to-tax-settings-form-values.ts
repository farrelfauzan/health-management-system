import type { TaxSettingsView } from '@hms/shared-types';

import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';

/** The server's answer as the form's starting position. */
export function toTaxSettingsFormValues(settings: TaxSettingsView): TaxSettingsFormValues {
  return {
    taxpayerType: settings.taxpayerType ?? '',
    incomeTaxRegime: settings.incomeTaxRegime,
    pp55StartYear: settings.pp55StartYear === undefined ? '' : String(settings.pp55StartYear),
    isPkp: settings.isPkp,
    pkpSince: settings.pkpSince ?? '',
    nitku: settings.nitku ?? '',
    pricesIncludeTax: settings.pricesIncludeTax,
  };
}
