import { LabResultFlagValue, LabResultRangeSnapshot, computeLabFlag } from '@hms/shared-types';

/** The adult female haemoglobin band the ticket is written around. */
const HAEMOGLOBIN_RANGE: LabResultRangeSnapshot = {
  refLow: 12,
  refHigh: 16,
  refCriticalLow: 7,
  refCriticalHigh: 20,
  refText: null,
};

const DENGUE_RANGE: LabResultRangeSnapshot = {
  refLow: null,
  refHigh: null,
  refCriticalLow: null,
  refCriticalHigh: null,
  refText: 'Negatif',
};

function computeNumericFlag(
  value: number | null,
  range: LabResultRangeSnapshot | null = HAEMOGLOBIN_RANGE,
): LabResultFlagValue | null {
  return computeLabFlag({
    resultType: 'NUMERIC',
    valueNumeric: value,
    valueText: null,
    valueCoded: null,
    range,
  });
}

describe('computeLabFlag', () => {
  describe('numeric values against a full band', () => {
    const cases: Array<[number, LabResultFlagValue]> = [
      [6.8, 'CRITICAL_LOW'],
      [6.999, 'CRITICAL_LOW'],
      [7, 'LOW'],
      [11.999, 'LOW'],
      [12, 'NORMAL'],
      [14, 'NORMAL'],
      [16, 'NORMAL'],
      [16.001, 'HIGH'],
      [20, 'HIGH'],
      [20.001, 'CRITICAL_HIGH'],
      [25, 'CRITICAL_HIGH'],
    ];
    it.each(cases)('flags %p as %s', (inputValue, expectedFlag) => {
      expect(computeNumericFlag(inputValue)).toBe(expectedFlag);
    });
  });

  describe('boundaries', () => {
    it('treats a value exactly on the normal low bound as normal', () => {
      expect(computeNumericFlag(12)).toBe('NORMAL');
    });

    it('treats a value exactly on the critical low threshold as merely low', () => {
      expect(computeNumericFlag(7)).toBe('LOW');
    });

    it('treats a value exactly on the normal high bound as normal', () => {
      expect(computeNumericFlag(16)).toBe('NORMAL');
    });

    it('treats a value exactly on the critical high threshold as merely high', () => {
      expect(computeNumericFlag(20)).toBe('HIGH');
    });
  });

  describe('partial bands', () => {
    it('flags low against a band with no upper bound', () => {
      const inputRange: LabResultRangeSnapshot = {
        refLow: 12,
        refHigh: null,
        refCriticalLow: null,
        refCriticalHigh: null,
        refText: null,
      };
      expect(computeNumericFlag(200, inputRange)).toBe('NORMAL');
      expect(computeNumericFlag(11, inputRange)).toBe('LOW');
    });

    it('flags critical against a band that names only the critical thresholds', () => {
      const inputRange: LabResultRangeSnapshot = {
        refLow: null,
        refHigh: null,
        refCriticalLow: 7,
        refCriticalHigh: 20,
        refText: null,
      };
      expect(computeNumericFlag(6, inputRange)).toBe('CRITICAL_LOW');
      expect(computeNumericFlag(14, inputRange)).toBe('NORMAL');
    });
  });

  describe('missing information', () => {
    it('returns null when no band applied to the patient', () => {
      expect(computeNumericFlag(6.8, null)).toBeNull();
    });

    it('returns null — never NORMAL — when the band names no numeric bound', () => {
      const inputRange: LabResultRangeSnapshot = {
        refLow: null,
        refHigh: null,
        refCriticalLow: null,
        refCriticalHigh: null,
        refText: 'Negatif',
      };
      expect(computeNumericFlag(6.8, inputRange)).toBeNull();
    });

    it('returns null when the numeric value itself is absent', () => {
      expect(computeNumericFlag(null)).toBeNull();
    });
  });

  describe('coded and text values', () => {
    it('flags a coded value matching the normal answer as normal', () => {
      expect(
        computeLabFlag({
          resultType: 'CODED',
          valueNumeric: null,
          valueText: null,
          valueCoded: 'Negatif',
          range: DENGUE_RANGE,
        }),
      ).toBe('NORMAL');
    });

    it('flags a coded value differing from the normal answer as abnormal', () => {
      expect(
        computeLabFlag({
          resultType: 'CODED',
          valueNumeric: null,
          valueText: null,
          valueCoded: 'Positif',
          range: DENGUE_RANGE,
        }),
      ).toBe('ABNORMAL');
    });

    it('compares case-insensitively and ignores surrounding space', () => {
      expect(
        computeLabFlag({
          resultType: 'CODED',
          valueNumeric: null,
          valueText: null,
          valueCoded: '  negatif ',
          range: DENGUE_RANGE,
        }),
      ).toBe('NORMAL');
    });

    it('never returns a direction for a non-numeric result', () => {
      const actualFlag = computeLabFlag({
        resultType: 'TEXT',
        valueNumeric: null,
        valueText: 'Ditemukan bakteri gram negatif',
        valueCoded: null,
        range: DENGUE_RANGE,
      });
      expect(['NORMAL', 'ABNORMAL']).toContain(actualFlag);
    });

    it('returns null when the band names no normal answer to compare against', () => {
      expect(
        computeLabFlag({
          resultType: 'TEXT',
          valueNumeric: null,
          valueText: 'Jernih',
          valueCoded: null,
          range: HAEMOGLOBIN_RANGE,
        }),
      ).toBeNull();
    });
  });
});
