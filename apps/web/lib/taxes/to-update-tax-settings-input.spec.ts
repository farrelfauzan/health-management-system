import { describe, expect, it } from 'vitest';

import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';
import { toUpdateTaxSettingsInput } from '#lib/taxes/to-update-tax-settings-input';

const initial: TaxSettingsFormValues = {
  taxpayerType: 'PT',
  incomeTaxRegime: 'PP55_FINAL',
  pp55StartYear: '2022',
  isPkp: false,
  pkpSince: '',
  nitku: '',
  pricesIncludeTax: true,
};

describe('toUpdateTaxSettingsInput', () => {
  it('names only what changed, so an untouched PP 55 regime is not re-judged', () => {
    const actual = toUpdateTaxSettingsInput({
      values: { ...initial, pricesIncludeTax: false },
      initial,
    });

    expect(actual).toEqual({ pricesIncludeTax: false });
  });

  it('turns blanks into null and a start year into a number', () => {
    const actual = toUpdateTaxSettingsInput({
      values: { ...initial, taxpayerType: '', pp55StartYear: '2025', nitku: ' ' },
      initial: { ...initial, nitku: '0012345678901000000000' },
    });

    expect(actual).toEqual({ taxpayerType: null, pp55StartYear: 2025, nitku: null });
  });

  it('drops the registration date when the clinic is no longer PKP', () => {
    const actual = toUpdateTaxSettingsInput({
      values: { ...initial, isPkp: false, pkpSince: '2026-01-02' },
      initial: { ...initial, isPkp: true, pkpSince: '2026-01-02' },
    });

    expect(actual).toEqual({ isPkp: false, pkpSince: null });
  });
});
