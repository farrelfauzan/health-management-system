import {
  isOffboardingWindowClosed,
  OFFBOARDED_PERMISSION_KEYS,
  OFFBOARDING_WINDOW_DAYS,
  resolveOffboardingDaysRemaining,
  resolveOffboardingDeadline,
} from '@hms/shared-types';

/**
 * The date arithmetic behind the window (`P16-T41`), pinned here because
 * `@hms/shared-types` has no test runner of its own and three callers — the
 * login path, the sweep and the preview — all depend on it agreeing with
 * itself.
 */
describe('offboarding window', () => {
  const JAKARTA = 'Asia/Jakarta';

  it('counts thirty clinic days from the calendar day of the offboarding', () => {
    // 23:30 UTC on the 4th is already the 5th in Jakarta, so the window is
    // counted from the 5th — an offboarding late in the evening does not
    // lose a day to the server clock.
    const actual = resolveOffboardingDeadline(new Date('2026-09-04T23:30:00.000Z'), JAKARTA);

    expect(actual.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(OFFBOARDING_WINDOW_DAYS).toBe(30);
  });

  it('reports whole days remaining in the clinic calendar', () => {
    const offboardedAt = new Date('2026-09-04T10:00:00.000Z');

    expect(
      resolveOffboardingDaysRemaining(offboardedAt, new Date('2026-09-04T12:00:00.000Z'), JAKARTA),
    ).toBe(30);
    expect(
      resolveOffboardingDaysRemaining(offboardedAt, new Date('2026-09-27T03:00:00.000Z'), JAKARTA),
    ).toBe(7);
    expect(
      resolveOffboardingDaysRemaining(offboardedAt, new Date('2026-10-04T01:00:00.000Z'), JAKARTA),
    ).toBe(0);
  });

  it('closes the window on the deadline day itself, not the day after', () => {
    const offboardedAt = new Date('2026-09-04T10:00:00.000Z');

    expect(
      isOffboardingWindowClosed(offboardedAt, new Date('2026-10-03T16:59:00.000Z'), JAKARTA),
    ).toBe(false);
    // 17:00 UTC on the 3rd is 00:00 on the 4th in Jakarta.
    expect(
      isOffboardingWindowClosed(offboardedAt, new Date('2026-10-03T17:00:00.000Z'), JAKARTA),
    ).toBe(true);
  });

  it('keeps the reduced key set to the own vault, read and delete only', () => {
    // FR-E3-23: view, download, export (all `read`) and delete. No `write`,
    // and above all no `share`.
    expect([...OFFBOARDED_PERMISSION_KEYS].sort()).toEqual([
      'vault-document.delete:own',
      'vault-document.read:own',
    ]);
  });
});
