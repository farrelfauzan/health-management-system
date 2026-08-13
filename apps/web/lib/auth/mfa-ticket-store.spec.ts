import { afterEach, describe, expect, it } from 'vitest';

import { mfaTicketStore } from './mfa-ticket-store';

describe('mfaTicketStore (SJ-8)', () => {
  afterEach(() => {
    mfaTicketStore.set(null);
  });

  it('presents the ticket on the three routes that accept one', () => {
    mfaTicketStore.set('pending.ticket.value');

    expect(mfaTicketStore.resolveFor('/api/v1/auth/mfa/enroll')).toBe('pending.ticket.value');
    expect(mfaTicketStore.resolveFor('/api/v1/auth/mfa/verify')).toBe('pending.ticket.value');
    expect(mfaTicketStore.resolveFor('/api/v1/auth/mfa/challenge')).toBe('pending.ticket.value');
  });

  /**
   * The property that makes a module-scoped ticket safe: a request that is not
   * one of the three cannot pick it up, so nothing in flight elsewhere in the
   * app can be sent a half-authenticated credential.
   */
  it.each([
    '/api/v1/auth/mfa/status',
    '/api/v1/auth/mfa/recovery-codes',
    '/api/v1/auth/mfa/reset',
    '/api/v1/patients',
    '/api/v1/auth/refresh',
  ])('never presents it on %s', (inputUrl) => {
    mfaTicketStore.set('pending.ticket.value');

    expect(mfaTicketStore.resolveFor(inputUrl)).toBeNull();
  });

  it('resolves to nothing once cleared', () => {
    mfaTicketStore.set('pending.ticket.value');
    mfaTicketStore.set(null);

    expect(mfaTicketStore.resolveFor('/api/v1/auth/mfa/challenge')).toBeNull();
  });

  it('resolves to nothing for a request with no url', () => {
    mfaTicketStore.set('pending.ticket.value');

    expect(mfaTicketStore.resolveFor(undefined)).toBeNull();
  });
});
