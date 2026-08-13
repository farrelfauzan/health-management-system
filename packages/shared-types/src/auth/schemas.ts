import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().jwt(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().jwt(),
});

/**
 * A TOTP code as an authenticator app renders it (SJ-8): six digits, with the
 * optional gap in the middle that every authenticator on the market draws.
 * Refusing the space people can literally see is a support ticket, not a
 * security control; the API strips it before verifying.
 *
 * Expressed with plain string checks rather than `.transform().pipe()` on
 * purpose. A piped schema is a `ZodPipeline`, which `nestjs-zod` cannot render
 * into OpenAPI — it emits an empty type, Orval refuses the document, and the
 * frontend silently loses the endpoint. Normalisation therefore lives in
 * `MfaService`, where it is visible next to the verification it feeds.
 */
export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{3}\s?\d{3}$/, 'Enter the six-digit code from your authenticator app');

/**
 * A recovery code as it was issued: `xxxxx-xxxxx-xxxxx` in Crockford base32,
 * an alphabet that omits `i`, `l`, `o` and `u` so nothing can be misread off
 * paper. Normalised to lower case with spaces stripped before matching, so a
 * code transcribed in capitals still works.
 *
 * Fifteen characters is 75 bits. Ten would have been friendlier to type and is
 * what most services issue, but these are stored as plain SHA-256 — 50 bits
 * against an offline attacker holding a database dump is an uncomfortable
 * margin, and 75 puts it out of reach entirely. The cost is five characters,
 * typed once, in an emergency.
 */
export const mfaRecoveryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/,
    'Invalid recovery code',
  );

export const mfaVerifyEnrolmentSchema = z.object({
  code: totpCodeSchema,
});

/**
 * The challenge accepts either factor, never both, and at least one. A body
 * carrying both would leave the server choosing which to spend, and spending a
 * recovery code the user did not intend to burn is not a choice to make on
 * their behalf.
 */
export const mfaChallengeSchema = z
  .object({
    code: totpCodeSchema.optional(),
    recoveryCode: mfaRecoveryCodeSchema.optional(),
  })
  .refine(
    (value) => (value.code === undefined) !== (value.recoveryCode === undefined),
    'Provide either an authenticator code or a recovery code',
  );

/**
 * Regenerating recovery codes re-proves possession first. Without the code
 * this endpoint would let anyone holding a live access token — a borrowed
 * unlocked workstation, a stolen token — mint themselves a fresh set of
 * permanent bypasses for the second factor.
 */
export const mfaRegenerateRecoveryCodesSchema = z.object({
  code: totpCodeSchema,
});

/**
 * An admin removing somebody else's second factor (lost device). The admin's
 * own current TOTP code is required in the body: this is the one action that
 * downgrades another account to a password, so it must not be reachable with a
 * session alone.
 */
export const mfaResetSchema = z.object({
  userId: z.string().uuid(),
  actorCode: totpCodeSchema,
  reason: z.string().trim().min(1).max(500),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type MfaVerifyEnrolmentInput = z.infer<typeof mfaVerifyEnrolmentSchema>;
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;
export type MfaRegenerateRecoveryCodesInput = z.infer<typeof mfaRegenerateRecoveryCodesSchema>;
export type MfaResetInput = z.infer<typeof mfaResetSchema>;
