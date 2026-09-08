import type { LabReferenceRangeView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { previewLabFlag } from './preview-lab-flag';

const ADULT_FEMALE_HB: LabReferenceRangeView = {
  id: 'r1',
  sex: 'FEMALE',
  low: 12,
  high: 16,
  criticalLow: 7,
  criticalHigh: 20,
};

const patient = {
  id: 'p1',
  fullName: 'Siti Rahayu',
  mrn: 'MRN00000123',
  dateOfBirth: '1990-04-12',
  sex: 'FEMALE' as const,
  ageYears: 36,
};

function preview(valueNumeric: number, collectedAt: string | null = '2026-09-07T01:15:00.000Z') {
  return previewLabFlag({
    resultType: 'NUMERIC',
    valueNumeric,
    valueText: null,
    valueCoded: null,
    referenceRanges: [ADULT_FEMALE_HB],
    patient,
    collectedAt,
  });
}

describe('previewLabFlag', () => {
  it.each([
    [11.2, 'LOW'],
    [14, 'NORMAL'],
    [17, 'HIGH'],
    [6.8, 'CRITICAL_LOW'],
    [21, 'CRITICAL_HIGH'],
  ])('flags %s as %s against the band the server would snapshot', (value, expected) => {
    const actual = preview(value);

    expect(actual.flag).toBe(expected);
    expect(actual.range).toEqual({
      refLow: 12,
      refHigh: 16,
      refCriticalLow: 7,
      refCriticalHigh: 20,
      refText: null,
    });
  });

  it('judges a coded value against its normal text', () => {
    const actual = previewLabFlag({
      resultType: 'CODED',
      valueNumeric: null,
      valueText: null,
      valueCoded: 'Positif',
      referenceRanges: [{ id: 'r2', textNormal: 'Negatif' }],
      patient,
      collectedAt: '2026-09-07T01:15:00.000Z',
    });

    expect(actual.flag).toBe('ABNORMAL');
  });

  // Age is measured at collection. Before a tube exists there is no age to
  // judge by, and a banded range must not be guessed at.
  it('previews nothing against an age-banded range before collection', () => {
    const actual = previewLabFlag({
      resultType: 'NUMERIC',
      valueNumeric: 11,
      valueText: null,
      valueCoded: null,
      referenceRanges: [{ ...ADULT_FEMALE_HB, ageMinDays: 6570 }],
      patient,
      collectedAt: null,
    });

    expect(actual.range).toBeNull();
    expect(actual.flag).toBeNull();
  });

  it('previews nothing for a patient no band covers', () => {
    const actual = previewLabFlag({
      resultType: 'NUMERIC',
      valueNumeric: 11,
      valueText: null,
      valueCoded: null,
      referenceRanges: [{ ...ADULT_FEMALE_HB, sex: 'MALE' }],
      patient,
      collectedAt: '2026-09-07T01:15:00.000Z',
    });

    expect(actual.flag).toBeNull();
  });
});
