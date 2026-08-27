import type { UserInvitationStatusValue } from '#user-invitation/schemas';

export type ListUserInvitationsParams = {
  page: number;
  limit: number;
  status?: UserInvitationStatusValue;
};

export type CreateUserInvitationRecord = {
  email: string;
  tokenHash: string;
  roleCodes: string[];
  invitedById: string;
  expiresAt: Date;
};

export type RotateUserInvitationTokenRecord = {
  invitationId: string;
  tokenHash: string;
  expiresAt: Date;
};

/**
 * What an invitation email needs to render. The link is assembled by the
 * service — the mail layer never sees the raw token on its own, so there is
 * one place that decides what a token is allowed to be pasted into.
 */
export type InvitationEmailPayload = {
  recipientEmail: string;
  invitationUrl: string;
  expiresAt: Date;
  invitedByEmail: string | null;
};
