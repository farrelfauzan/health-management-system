import { resolveInvitationStatus } from './resolve-invitation-status';

describe('resolveInvitationStatus', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');
  const future = new Date('2026-08-29T12:00:00.000Z');
  const past = new Date('2026-08-25T12:00:00.000Z');

  it('reports a live, untouched invitation as pending', () => {
    const actualStatus = resolveInvitationStatus(
      { expiresAt: future, consumedAt: null, revokedAt: null },
      now,
    );

    expect(actualStatus).toBe('PENDING');
  });

  it('reports a lapsed invitation as expired', () => {
    const actualStatus = resolveInvitationStatus(
      { expiresAt: past, consumedAt: null, revokedAt: null },
      now,
    );

    expect(actualStatus).toBe('EXPIRED');
  });

  it('treats the expiry instant itself as expired', () => {
    const actualStatus = resolveInvitationStatus(
      { expiresAt: now, consumedAt: null, revokedAt: null },
      now,
    );

    expect(actualStatus).toBe('EXPIRED');
  });

  it('reports a withdrawn invitation as revoked', () => {
    const actualStatus = resolveInvitationStatus(
      { expiresAt: future, consumedAt: null, revokedAt: past },
      now,
    );

    expect(actualStatus).toBe('REVOKED');
  });

  // The account the invitation created still exists, so "nothing happened
  // here" would be the wrong thing to show an administrator.
  it('still reports accepted once the expiry has passed', () => {
    const actualStatus = resolveInvitationStatus(
      { expiresAt: past, consumedAt: past, revokedAt: null },
      now,
    );

    expect(actualStatus).toBe('ACCEPTED');
  });

  // A resend revokes the row it replaces, and an invitee racing the resend can
  // consume the old link first. Acceptance is the fact that matters.
  it('prefers accepted over revoked when both are set', () => {
    const actualStatus = resolveInvitationStatus(
      { expiresAt: future, consumedAt: past, revokedAt: past },
      now,
    );

    expect(actualStatus).toBe('ACCEPTED');
  });
});
