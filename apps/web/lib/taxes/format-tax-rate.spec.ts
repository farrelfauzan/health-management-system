import { describe, expect, it } from 'vitest';

import { formatTaxRate } from '#lib/taxes/format-tax-rate';

describe('formatTaxRate', () => {
  it('shows the DPP nilai lain fraction and the effective rate', () => {
    expect(
      formatTaxRate({
        id: 'r1',
        ratePercent: 12,
        dppNumerator: 11,
        dppDenominator: 12,
        effectiveRatePercent: 11,
        effectiveFrom: '2025-01-01',
      }),
    ).toBe('12% × 11/12 = 11%');
  });

  it('shows a plain rate when the whole price is the base', () => {
    expect(
      formatTaxRate({
        id: 'r2',
        ratePercent: 11,
        dppNumerator: 1,
        dppDenominator: 1,
        effectiveRatePercent: 11,
        effectiveFrom: '2022-04-01',
      }),
    ).toBe('11%');
  });
});
