import { UserInvitationStatusValue } from '@hms/shared-types';

type InvitationTimestamps = {
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
};

/**
 * Derives an invitation's lifecycle state from its timestamps.
 *
 * Order matters and is not arbitrary. A consumed invitation reads as
 * `ACCEPTED` even once its `expiresAt` has passed, because the account it
 * created still exists — reporting it as `EXPIRED` would suggest nothing
 * happened. Revocation outranks expiry for the same reason in reverse: an
 * administrator withdrew it, and that is the fact worth reading back.
 */
export function resolveInvitationStatus(
  invitation: InvitationTimestamps,
  now: Date = new Date(),
): UserInvitationStatusValue {
  if (invitation.consumedAt) {
    return 'ACCEPTED';
  }
  if (invitation.revokedAt) {
    return 'REVOKED';
  }
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'PENDING';
}
