import { ClinicianFeeRuleRecord, resolveClinicianFeeRule } from '@hms/shared-types';

/**
 * P27-T06. The most specific rule in force on the payment day wins:
 * clinician + tariff, tariff, clinician + category, category.
 */
describe('resolveClinicianFeeRule', () => {
  const doctorA = '11111111-1111-4111-8111-111111111111';
  const doctorB = '22222222-2222-4222-8222-222222222222';
  const consultationTariff = '33333333-3333-4333-8333-333333333333';

  function buildRule(overrides: Partial<ClinicianFeeRuleRecord>): ClinicianFeeRuleRecord {
    return {
      id: 'rule',
      serviceTariffId: null,
      category: null,
      doctorId: null,
      mode: 'PERCENT',
      value: 50,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      ...overrides,
    };
  }

  const categoryRule = buildRule({ id: 'category', category: 'CONSULTATION', value: 40 });
  const clinicianCategoryRule = buildRule({
    id: 'clinician-category',
    category: 'CONSULTATION',
    doctorId: doctorA,
    value: 60,
  });
  const tariffRule = buildRule({ id: 'tariff', serviceTariffId: consultationTariff, value: 45 });
  const clinicianTariffRule = buildRule({
    id: 'clinician-tariff',
    serviceTariffId: consultationTariff,
    doctorId: doctorA,
    value: 70,
  });
  const allRules = [categoryRule, clinicianCategoryRule, tariffRule, clinicianTariffRule];
  const inputLine = {
    doctorId: doctorA,
    serviceTariffId: consultationTariff,
    category: 'CONSULTATION' as const,
    onDate: '2026-10-01',
  };

  it('prefers clinician + tariff over every other level', () => {
    const actual = resolveClinicianFeeRule({ ...inputLine, rules: allRules });

    expect(actual).toEqual({ rule: clinicianTariffRule, level: 'CLINICIAN_TARIFF' });
  });

  it('falls back to the clinic-wide tariff rule', () => {
    const actual = resolveClinicianFeeRule({
      ...inputLine,
      rules: [categoryRule, clinicianCategoryRule, tariffRule],
    });

    expect(actual?.level).toBe('TARIFF');
  });

  it('falls back to clinician + category, then category', () => {
    const actualClinicianCategory = resolveClinicianFeeRule({
      ...inputLine,
      rules: [categoryRule, clinicianCategoryRule],
    });
    const actualCategory = resolveClinicianFeeRule({ ...inputLine, rules: [categoryRule] });

    expect(actualClinicianCategory?.level).toBe('CLINICIAN_CATEGORY');
    expect(actualCategory?.level).toBe('CATEGORY');
  });

  it("never applies another clinician's rule", () => {
    const actual = resolveClinicianFeeRule({ ...inputLine, doctorId: doctorB, rules: allRules });

    expect(actual?.rule.id).toBe('tariff');
  });

  it('matches a line without a tariff by category only', () => {
    const actual = resolveClinicianFeeRule({
      ...inputLine,
      serviceTariffId: null,
      rules: allRules,
    });

    expect(actual?.rule.id).toBe('clinician-category');
  });

  it('skips rules not in force on the payment day, both ends inclusive', () => {
    const endedRule = { ...clinicianTariffRule, effectiveTo: '2026-09-30' };
    const futureRule = { ...tariffRule, effectiveFrom: '2026-10-02' };
    const lastDayRule = { ...clinicianCategoryRule, effectiveTo: '2026-10-01' };

    const actual = resolveClinicianFeeRule({
      ...inputLine,
      rules: [endedRule, futureRule, lastDayRule, categoryRule],
    });

    expect(actual?.rule.id).toBe('clinician-category');
  });

  it('breaks a tie at one level by the later start', () => {
    const olderRule = buildRule({ id: 'older', category: 'CONSULTATION', value: 30 });
    const newerRule = buildRule({
      id: 'newer',
      category: 'CONSULTATION',
      value: 35,
      effectiveFrom: '2026-06-01',
    });

    const actual = resolveClinicianFeeRule({ ...inputLine, rules: [newerRule, olderRule] });

    expect(actual?.rule.id).toBe('newer');
  });

  it('returns null when nothing applies', () => {
    const actual = resolveClinicianFeeRule({
      ...inputLine,
      category: 'LAB',
      rules: [categoryRule],
    });

    expect(actual).toBeNull();
  });
});
