/**
 * Deployment-shaped settings for the invitation flow. Infrastructure rather
 * than domain — the web origin and the token lifetime describe where this
 * installation is served from, not what an invitation is — so this stays in
 * the API alongside `storage.types.ts` rather than in `@hms/shared-types`.
 */
export type UserInvitationConfig = {
  readonly webAppBaseUrl: string;
  readonly ttlHours: number;
};
