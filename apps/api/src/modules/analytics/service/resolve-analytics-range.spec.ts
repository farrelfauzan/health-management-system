import {
  resolveAnalyticsComparisonPeriod,
  resolveAnalyticsGranularity,
  resolveAnalyticsRange,
} from '@hms/shared-types';

describe('resolveAnalyticsRange', () => {
  it('keeps a payment at 23:30 WIB on 31 August inside 1–31 August', () => {
    const inputPaidAt = new Date('2026-08-31T23:30:00+07:00');

    const actual = resolveAnalyticsRange({ from: '2026-08-01', to: '2026-08-31', timeZone: 'Asia/Jakarta' });

    expect(actual.start.toISOString()).toBe('2026-07-31T17:00:00.000Z');
    expect(actual.end.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(inputPaidAt >= actual.start && inputPaidAt < actual.end).toBe(true);
  });

  it('leaves a payment at 00:10 WIB on 1 September outside 1–31 August', () => {
    const inputPaidAt = new Date('2026-09-01T00:10:00+07:00');

    const actual = resolveAnalyticsRange({ from: '2026-08-01', to: '2026-08-31', timeZone: 'Asia/Jakarta' });

    expect(inputPaidAt < actual.end).toBe(false);
  });

  it('cuts days in the configured zone, not Jakarta', () => {
    const actual = resolveAnalyticsRange({ from: '2026-08-01', to: '2026-08-01', timeZone: 'Asia/Jayapura' });

    expect(actual.start.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(actual.dayCount).toBe(1);
  });
});

describe('resolveAnalyticsGranularity', () => {
  it.each([
    [1, 'day'],
    [45, 'day'],
    [46, 'week'],
    [182, 'week'],
    [183, 'month'],
  ])('buckets %i days by %s', (inputDayCount, expected) => {
    expect(resolveAnalyticsGranularity(inputDayCount)).toBe(expected);
  });
});

describe('resolveAnalyticsComparisonPeriod', () => {
  it('compares 1–30 September with all of August', () => {
    expect(resolveAnalyticsComparisonPeriod({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('compares 10–16 September with 3–9 September', () => {
    expect(resolveAnalyticsComparisonPeriod({ from: '2026-09-10', to: '2026-09-16' })).toEqual({
      from: '2026-09-03',
      to: '2026-09-09',
    });
  });

  it('compares March with February, across the short month', () => {
    expect(resolveAnalyticsComparisonPeriod({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('compares January with the previous December', () => {
    expect(resolveAnalyticsComparisonPeriod({ from: '2026-01-01', to: '2026-01-31' })).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('treats a part month as days, not as a month', () => {
    expect(resolveAnalyticsComparisonPeriod({ from: '2026-09-01', to: '2026-09-29' })).toEqual({
      from: '2026-08-03',
      to: '2026-08-31',
    });
  });
});
