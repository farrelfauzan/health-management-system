import { computeClinicianFee, hasOverlappingClinicianFeeRule } from '@hms/shared-types';

/** P27-T06. Integer cents; the two shares always add up to the line. */
describe('computeClinicianFee', () => {
  it('gives 60% of a Rp150,000 consultation as Rp90,000 (the ticket example)', () => {
    const actual = computeClinicianFee({
      lineAmount: 150_000,
      quantity: 1,
      mode: 'PERCENT',
      value: 60,
    });

    expect(actual).toEqual({ grossFee: 90_000, clinicShare: 60_000 });
  });

  it('rounds a percentage half up to a whole rupiah', () => {
    const actual = computeClinicianFee({
      lineAmount: 100_001,
      quantity: 1,
      mode: 'PERCENT',
      value: 33.33,
    });

    expect(actual).toEqual({ grossFee: 33_330, clinicShare: 66_671 });
  });

  it('multiplies a fixed fee by the quantity', () => {
    const actual = computeClinicianFee({
      lineAmount: 150_000,
      quantity: 2,
      mode: 'FIXED',
      value: 25_000.5,
    });

    expect(actual).toEqual({ grossFee: 50_001, clinicShare: 99_999 });
  });

  it('never lets a fixed fee exceed the line', () => {
    const actual = computeClinicianFee({
      lineAmount: 40_000,
      quantity: 1,
      mode: 'FIXED',
      value: 50_000,
    });

    expect(actual).toEqual({ grossFee: 40_000, clinicShare: 0 });
  });

  it('keeps a 0% or 100% rule exact', () => {
    const actualNone = computeClinicianFee({
      lineAmount: 75_000,
      quantity: 1,
      mode: 'PERCENT',
      value: 0,
    });
    const actualWhole = computeClinicianFee({
      lineAmount: 75_000.5,
      quantity: 1,
      mode: 'PERCENT',
      value: 100,
    });

    expect(actualNone).toEqual({ grossFee: 0, clinicShare: 75_000 });
    expect(actualWhole.grossFee + actualWhole.clinicShare).toBe(75_000.5);
  });
});

describe('hasOverlappingClinicianFeeRule', () => {
  const existing = [{ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }];

  it('allows a rule that starts the day after another ends', () => {
    const actual = hasOverlappingClinicianFeeRule({
      candidate: { effectiveFrom: '2026-07-01', effectiveTo: null },
      existing,
    });

    expect(actual).toBe(false);
  });

  it('refuses a rule sharing a single day, both ends inclusive', () => {
    const actual = hasOverlappingClinicianFeeRule({
      candidate: { effectiveFrom: '2026-06-30', effectiveTo: null },
      existing,
    });

    expect(actual).toBe(true);
  });

  it('treats an open end as running forever', () => {
    const actual = hasOverlappingClinicianFeeRule({
      candidate: { effectiveFrom: '2020-01-01', effectiveTo: '2025-12-31' },
      existing: [{ effectiveFrom: '2025-12-31', effectiveTo: null }],
    });

    expect(actual).toBe(true);
  });
});
