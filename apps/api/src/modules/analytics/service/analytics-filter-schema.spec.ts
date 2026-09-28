import { analyticsFilterSchema } from '@hms/shared-types';

describe('analyticsFilterSchema', () => {
  it('accepts a month and reads compare from the query string', () => {
    const actual = analyticsFilterSchema.parse({ from: '2026-09-01', to: '2026-09-30', compare: 'true' });

    expect(actual).toEqual({ from: '2026-09-01', to: '2026-09-30', compare: true });
  });

  it('defaults compare to off', () => {
    expect(analyticsFilterSchema.parse({ from: '2026-09-01', to: '2026-09-01' }).compare).toBe(false);
  });

  it('refuses 1 January 2024 to 30 September 2026 with a plain message', () => {
    const actual = analyticsFilterSchema.safeParse({ from: '2024-01-01', to: '2026-09-30' });

    expect(actual.success).toBe(false);
    expect(actual.error?.issues[0]?.message).toBe('Choose a range of at most 24 months');
  });

  it('accepts exactly 24 months and refuses one day more', () => {
    expect(analyticsFilterSchema.safeParse({ from: '2024-01-01', to: '2025-12-31' }).success).toBe(true);
    expect(analyticsFilterSchema.safeParse({ from: '2024-01-01', to: '2026-01-01' }).success).toBe(false);
  });

  it('refuses an end before the start', () => {
    const actual = analyticsFilterSchema.safeParse({ from: '2026-09-10', to: '2026-09-01' });

    expect(actual.error?.issues[0]?.message).toBe('The end date cannot be before the start date');
  });

  it.each(['2026-02-30', '2026-9-01', 'yesterday'])('refuses %s as a date', (inputDate) => {
    expect(analyticsFilterSchema.safeParse({ from: inputDate, to: '2026-09-30' }).success).toBe(false);
  });

  it('refuses a payer type it does not know', () => {
    const actual = analyticsFilterSchema.safeParse({
      from: '2026-09-01',
      to: '2026-09-30',
      payerType: 'CASH',
    });

    expect(actual.success).toBe(false);
  });
});
