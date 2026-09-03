import { describe, expect, it } from 'vitest';

import { resolveVaultExpiryStatus } from './vault-expiry-status';

const TODAY = new Date('2026-09-03T10:00:00.000Z');

describe('resolveVaultExpiryStatus', () => {
  it('treats a document with no expiry as a normal state, not a problem', () => {
    // Most of what a vault holds — an ijazah, a CV, a KTP scan — has no
    // renewal date at all. Flagging them would train the owner to ignore the
    // flag that matters.
    expect(resolveVaultExpiryStatus(null, TODAY)).toBe('NO_EXPIRY');
  });

  it('counts a document expiring today as not yet expired', () => {
    expect(resolveVaultExpiryStatus('2026-09-03', TODAY)).toBe('EXPIRING_SOON');
  });

  it('marks yesterday expired', () => {
    expect(resolveVaultExpiryStatus('2026-09-02', TODAY)).toBe('EXPIRED');
  });

  it('warns from the same day the reminder job announces, sixty days out', () => {
    expect(resolveVaultExpiryStatus('2026-11-02', TODAY)).toBe('EXPIRING_SOON');
    expect(resolveVaultExpiryStatus('2026-11-03', TODAY)).toBe('VALID');
  });

  it('treats an unparseable date as no expiry rather than as expired', () => {
    // A row the badge cannot read must not be shouted about. Reporting it as
    // expired would send an owner looking for a renewal that is not due.
    expect(resolveVaultExpiryStatus('not-a-date', TODAY)).toBe('NO_EXPIRY');
  });
});
