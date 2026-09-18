import { resolvePp55Eligibility } from '@hms/shared-types';

/**
 * P27-T02. PP 55/2022 as amended by PP 20/2026 (in force 22 April 2026): no
 * end year for individuals and PT perorangan, four tax years for a koperasi,
 * and a PT (three) or CV (four) only as the transition from a start year no
 * later than 2026. A yayasan is never a PP 55 taxpayer.
 */
describe('resolvePp55Eligibility', () => {
  it('has no end year for an individual or a PT perorangan', () => {
    const actualIndividual = resolvePp55Eligibility({
      taxpayerType: 'INDIVIDUAL',
      startYear: 2018,
      currentYear: 2031,
    });
    const actualPtPerorangan = resolvePp55Eligibility({
      taxpayerType: 'PT_PERORANGAN',
      startYear: null,
      currentYear: 2031,
    });

    expect(actualIndividual).toEqual({ isEligible: true, lastEligibleYear: null });
    expect(actualPtPerorangan).toEqual({ isEligible: true, lastEligibleYear: null });
  });

  it('refuses a PT without a start year, the case the ticket names', () => {
    const actual = resolvePp55Eligibility({
      taxpayerType: 'PT',
      startYear: null,
      currentYear: 2026,
    });

    expect(actual.isEligible).toBe(false);
  });

  it('lets a PT that started in 2025 finish its three tax years', () => {
    const actual = resolvePp55Eligibility({
      taxpayerType: 'PT',
      startYear: 2025,
      currentYear: 2026,
    });

    expect(actual).toEqual({ isEligible: true, lastEligibleYear: 2027 });
  });

  it('gives a CV and a koperasi four tax years', () => {
    const actualCv = resolvePp55Eligibility({
      taxpayerType: 'CV',
      startYear: 2024,
      currentYear: 2026,
    });
    const actualKoperasi = resolvePp55Eligibility({
      taxpayerType: 'KOPERASI',
      startYear: 2028,
      currentYear: 2028,
    });

    expect(actualCv).toEqual({ isEligible: true, lastEligibleYear: 2027 });
    expect(actualKoperasi).toEqual({ isEligible: true, lastEligibleYear: 2031 });
  });

  it('refuses a PT or CV starting after PP 20/2026 closed the scheme to them', () => {
    const actual = resolvePp55Eligibility({
      taxpayerType: 'CV',
      startYear: 2027,
      currentYear: 2027,
    });

    expect(actual.isEligible).toBe(false);
  });

  it('refuses a badan whose period has ended and names the last year', () => {
    const actual = resolvePp55Eligibility({
      taxpayerType: 'PT',
      startYear: 2022,
      currentYear: 2026,
    });

    expect(actual).toMatchObject({ isEligible: false, lastEligibleYear: 2024 });
  });

  it('refuses a yayasan, an unknown taxpayer and a start year in the future', () => {
    expect(
      resolvePp55Eligibility({ taxpayerType: 'YAYASAN', startYear: 2025, currentYear: 2026 })
        .isEligible,
    ).toBe(false);
    expect(
      resolvePp55Eligibility({ taxpayerType: null, startYear: 2025, currentYear: 2026 }).isEligible,
    ).toBe(false);
    expect(
      resolvePp55Eligibility({ taxpayerType: 'INDIVIDUAL', startYear: 2027, currentYear: 2026 })
        .isEligible,
    ).toBe(false);
  });
});
