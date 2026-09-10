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
  /**
   * The doctor profile this invitation was raised for (P19-T15), when it came
   * from the create-doctor form rather than the staff invitation screen. Null
   * for every ordinary staff invitation. Accepting a bound invitation links
   * the new account to that profile in the accept transaction, which is what
   * lets an email be entered once, at creation, without a second copy of the
   * address ever being written onto the profile.
   */
  doctorProfileId?: string | null;
};

export type RotateUserInvitationTokenRecord = {
  invitationId: string;
  tokenHash: string;
  expiresAt: Date;
};

/**
 * What the create-doctor path is allowed to do with an email address, decided
 * before a single row is written (P19-T15).
 *
 * The decision is separated from the writing on purpose. The doctor profile
 * has to exist before an invitation can point at it, so an address that turns
 * out to be unusable must be refused while nothing has been created yet —
 * otherwise a 409 leaves a doctor behind with no account and no invitation.
 */
export type DoctorOwnerPlan =
  | {
      /** An account already exists; link it instead of inviting anyone. */
      kind: 'ATTACH';
      userId: string;
      email: string;
    }
  | {
      /** Nobody holds this address; raise an invitation once the profile exists. */
      kind: 'INVITE';
      email: string;
    };

export type InviteDoctorOwnerParams = {
  email: string;
  doctorProfileId: string;
  invitedById: string;
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
