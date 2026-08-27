import type { UserInvitationStatusValue } from '#user-invitation/schemas';

export type UserInvitationRole = {
  code: string;
  name: string;
};

/**
 * One row of the pending-invites list. Deliberately carries no token and no
 * hash: the raw token exists once, in the email, and the stored SHA-256 is of
 * no use to a client but is exactly what an attacker with read access to this
 * endpoint would want to correlate against a leaked mailbox.
 */
export type UserInvitationView = {
  id: string;
  email: string;
  status: UserInvitationStatusValue;
  roles: UserInvitationRole[];
  invitedByEmail: string | null;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

export type UserInvitationsListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * What the public `/invite/[token]` page is allowed to know before anyone has
 * proved anything: the address the invitation was sent to, so the invitee can
 * confirm they opened the right link, and when it lapses. Roles are omitted —
 * publishing the clinic's role catalogue to an unauthenticated URL that only
 * needs a 256-bit guess buys the invitee nothing.
 */
export type UserInvitationPreview = {
  email: string;
  expiresAt: string;
};

export type UserInvitationAcceptedView = {
  email: string;
};
