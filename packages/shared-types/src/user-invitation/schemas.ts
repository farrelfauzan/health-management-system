import { z } from 'zod';

import { passwordPolicySchema, userFullNameSchema } from '#admin-management/schemas';

/**
 * The lifecycle of one invitation, derived at read time rather than stored
 * (IMP-23). A single `status` column would need a background job to move rows
 * to `EXPIRED` the moment the clock passes `expiresAt`; deriving it from the
 * three timestamps means the answer is always current and the row only ever
 * records facts — when it was consumed, when it was revoked, when it stops
 * being valid.
 */
export const USER_INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export const userInvitationStatusSchema = z.enum(USER_INVITATION_STATUSES);
export type UserInvitationStatusValue = z.infer<typeof userInvitationStatusSchema>;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export const createUserInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  /**
   * Collected at invite time, not at accept time (P20-T05): the person the
   * clinic is inviting is somebody the administrator already knows the name
   * of, and asking the invitee to type it makes the account's name unverified
   * by anyone.
   */
  fullName: userFullNameSchema,
  roleCodes: z.array(z.string().min(1)).min(1),
});
export type CreateUserInvitationInput = z.infer<typeof createUserInvitationSchema>;

export const listUserInvitationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: userInvitationStatusSchema.optional(),
});
export type ListUserInvitationsQueryInput = z.infer<typeof listUserInvitationsQuerySchema>;

/**
 * The accept payload. The token travels in the path, never the body, so the
 * only thing the invitee submits is the password they are choosing — held to
 * the same `passwordPolicySchema` as every other place a password is set.
 */
export const acceptUserInvitationSchema = z.object({
  password: passwordPolicySchema,
});
export type AcceptUserInvitationInput = z.infer<typeof acceptUserInvitationSchema>;
