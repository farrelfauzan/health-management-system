import { describe, expect, it } from 'vitest';

import { formatClinicianFeeRuleValue } from '#lib/clinician-fees/format-clinician-fee-rule-value';

describe('formatClinicianFeeRuleValue', () => {
  it('shows a percentage as a percentage', () => {
    expect(
      formatClinicianFeeRuleValue({ mode: 'PERCENT', value: 60, perUnitLabel: '/ unit' }),
    ).toBe('60%');
  });

  it('shows a fixed fee as rupiah per unit', () => {
    const actual = formatClinicianFeeRuleValue({
      mode: 'FIXED',
      value: 50_000,
      perUnitLabel: '/ unit',
    });

    expect(actual).toMatch(/^Rp\s?50\.000 \/ unit$/);
  });
});
