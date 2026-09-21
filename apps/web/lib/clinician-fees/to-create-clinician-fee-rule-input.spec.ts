import { describe, expect, it } from 'vitest';

import { toClinicianFeeRuleFormValues } from '#lib/clinician-fees/to-clinician-fee-rule-form-values';
import { toCreateClinicianFeeRuleInput } from '#lib/clinician-fees/to-create-clinician-fee-rule-input';

describe('toCreateClinicianFeeRuleInput', () => {
  const doctorId = '11111111-1111-4111-8111-111111111111';

  it('sends a category rule without a tariff', () => {
    const actual = toCreateClinicianFeeRuleInput({
      ...toClinicianFeeRuleFormValues(null),
      doctorId,
      value: '60',
      effectiveFrom: '2026-10-01',
    });

    expect(actual).toEqual({
      category: 'CONSULTATION',
      doctorId,
      mode: 'PERCENT',
      value: 60,
      effectiveFrom: '2026-10-01',
    });
  });

  it('drops the category when a tariff is the target', () => {
    const actual = toCreateClinicianFeeRuleInput({
      ...toClinicianFeeRuleFormValues(null),
      targetKind: 'TARIFF',
      serviceTariffId: '22222222-2222-4222-8222-222222222222',
      mode: 'FIXED',
      value: '50000,5',
      effectiveFrom: '2026-10-01',
    });

    expect(actual).toEqual(
      expect.objectContaining({
        serviceTariffId: '22222222-2222-4222-8222-222222222222',
        value: 50000.5,
      }),
    );
    expect(actual?.category).toBeUndefined();
  });

  it('refuses a percentage above 100 and a missing start date', () => {
    const base = toClinicianFeeRuleFormValues(null);

    expect(
      toCreateClinicianFeeRuleInput({ ...base, value: '120', effectiveFrom: '2026-10-01' }),
    ).toBeNull();
    expect(toCreateClinicianFeeRuleInput({ ...base, value: '60' })).toBeNull();
  });
});
