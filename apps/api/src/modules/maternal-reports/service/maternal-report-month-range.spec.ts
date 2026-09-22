import { resolveMaternalReportMonthRange } from '@hms/shared-types';

describe('resolveMaternalReportMonthRange (P25-T15)', () => {
  it('opens October 2026 at Jakarta midnight and closes it at November midnight', () => {
    const actual = resolveMaternalReportMonthRange('2026-10', 'Asia/Jakarta');

    expect(actual.startInclusive.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(actual.endExclusive.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(actual.firstDay).toBe('2026-10-01');
    expect(actual.lastDay).toBe('2026-10-31');
  });

  it('rolls December into the next year and knows a leap February', () => {
    const december = resolveMaternalReportMonthRange('2026-12', 'Asia/Jakarta');
    const february = resolveMaternalReportMonthRange('2028-02', 'Asia/Makassar');

    expect(december.endExclusive.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(february.lastDay).toBe('2028-02-29');
    expect(february.startInclusive.toISOString()).toBe('2028-01-31T16:00:00.000Z');
  });
});
