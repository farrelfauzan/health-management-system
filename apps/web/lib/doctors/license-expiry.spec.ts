import { describe, expect, it } from 'vitest';

import { resolveLicenseExpiryStatus } from './license-expiry';

const TODAY = new Date('2026-07-29T10:00:00.000Z');

describe('resolveLicenseExpiryStatus', () => {
  it('treats a missing expiry as no expiry, not as a problem', () => {
    // STR carries no expiry under UU Kesehatan 17/2023.
    expect(resolveLicenseExpiryStatus(undefined, TODAY)).toBe('NO_EXPIRY');
  });

  it('flags a past expiry as expired', () => {
    expect(resolveLicenseExpiryStatus('2026-07-28', TODAY)).toBe('EXPIRED');
  });

  it('treats today as still valid, not expired', () => {
    expect(resolveLicenseExpiryStatus('2026-07-29', TODAY)).toBe('EXPIRING_SOON');
  });

  it('warns inside the notice window', () => {
    expect(resolveLicenseExpiryStatus('2026-08-15', TODAY)).toBe('EXPIRING_SOON');
  });

  it('stays valid beyond the notice window', () => {
    expect(resolveLicenseExpiryStatus('2027-01-01', TODAY)).toBe('VALID');
  });

  it('does not crash on an unparseable date', () => {
    expect(resolveLicenseExpiryStatus('not-a-date', TODAY)).toBe('NO_EXPIRY');
  });
});
