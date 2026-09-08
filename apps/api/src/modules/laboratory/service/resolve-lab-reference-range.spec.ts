import { LabReferenceRangeRecord, resolveLabReferenceRange } from '@hms/shared-types';

const ADULT_RANGE: LabReferenceRangeRecord = {
  id: 'adult',
  sex: null,
  ageMinDays: null,
  ageMaxDays: null,
  low: 12,
  high: 16,
  criticalLow: 7,
  criticalHigh: 20,
  textNormal: null,
};

const NEONATAL_RANGE: LabReferenceRangeRecord = {
  id: 'neonatal',
  sex: null,
  ageMinDays: 0,
  ageMaxDays: 28,
  low: 14,
  high: 24,
  criticalLow: 10,
  criticalHigh: 26,
  textNormal: null,
};

const FEMALE_ADULT_RANGE: LabReferenceRangeRecord = {
  id: 'female-adult',
  sex: 'FEMALE',
  ageMinDays: null,
  ageMaxDays: null,
  low: 11,
  high: 15,
  criticalLow: 7,
  criticalHigh: 20,
  textNormal: null,
};

const ONE_YEAR_IN_DAYS = 365;

describe('resolveLabReferenceRange', () => {
  it('returns null when the catalog names no band at all', () => {
    expect(
      resolveLabReferenceRange([], { sex: 'FEMALE', ageDaysAtCollection: 12_000 }),
    ).toBeNull();
  });

  it('picks the unbanded adult range for an adult', () => {
    const actualRange = resolveLabReferenceRange([ADULT_RANGE, NEONATAL_RANGE], {
      sex: 'FEMALE',
      ageDaysAtCollection: 12_000,
    });
    expect(actualRange?.refLow).toBe(12);
  });

  it('picks the neonatal band for a three-week-old, never the adult one', () => {
    const actualRange = resolveLabReferenceRange([ADULT_RANGE, NEONATAL_RANGE], {
      sex: 'MALE',
      ageDaysAtCollection: 21,
    });
    expect(actualRange?.refLow).toBe(14);
  });

  it('treats both age bounds as inclusive', () => {
    const expectedNeonatal = resolveLabReferenceRange([ADULT_RANGE, NEONATAL_RANGE], {
      sex: 'MALE',
      ageDaysAtCollection: 28,
    });
    const expectedAdult = resolveLabReferenceRange([ADULT_RANGE, NEONATAL_RANGE], {
      sex: 'MALE',
      ageDaysAtCollection: 29,
    });
    expect(expectedNeonatal?.refLow).toBe(14);
    expect(expectedAdult?.refLow).toBe(12);
  });

  it('prefers a sexed band over an unsexed one', () => {
    const actualRange = resolveLabReferenceRange([ADULT_RANGE, FEMALE_ADULT_RANGE], {
      sex: 'FEMALE',
      ageDaysAtCollection: 12_000,
    });
    expect(actualRange?.refLow).toBe(11);
  });

  it('ignores a band for the other sex', () => {
    const actualRange = resolveLabReferenceRange([ADULT_RANGE, FEMALE_ADULT_RANGE], {
      sex: 'MALE',
      ageDaysAtCollection: 12_000,
    });
    expect(actualRange?.refLow).toBe(12);
  });

  it('refuses to guess a band when the age is unknown', () => {
    const actualRange = resolveLabReferenceRange([NEONATAL_RANGE], {
      sex: 'MALE',
      ageDaysAtCollection: null,
    });
    expect(actualRange).toBeNull();
  });

  it('falls back to an unbanded row when the age is unknown', () => {
    const actualRange = resolveLabReferenceRange([ADULT_RANGE, NEONATAL_RANGE], {
      sex: 'MALE',
      ageDaysAtCollection: null,
    });
    expect(actualRange?.refLow).toBe(12);
  });

  it('carries the critical thresholds onto the snapshot', () => {
    const actualRange = resolveLabReferenceRange([ADULT_RANGE], {
      sex: 'FEMALE',
      ageDaysAtCollection: ONE_YEAR_IN_DAYS * 30,
    });
    expect(actualRange).toEqual({
      refLow: 12,
      refHigh: 16,
      refCriticalLow: 7,
      refCriticalHigh: 20,
      refText: null,
    });
  });
});
