import { describe, expect, it } from 'vitest';

import { computePatientAge } from './patient-age';

describe('computePatientAge', () => {
  const referenceDate = new Date('2026-07-21T00:00:00.000Z');

  it('computes age when the birthday has passed this year', () => {
    expect(computePatientAge('1990-05-12', referenceDate)).toBe(36);
  });

  it('computes age when the birthday has not passed this year', () => {
    expect(computePatientAge('1990-11-30', referenceDate)).toBe(35);
  });

  it('computes age on the exact birthday', () => {
    expect(computePatientAge('2000-07-21', referenceDate)).toBe(26);
  });

  it('returns zero for an invalid date of birth', () => {
    expect(computePatientAge('not-a-date', referenceDate)).toBe(0);
  });
});
