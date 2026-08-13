/**
 * What a client receives on login or refresh (SJ-6).
 *
 * The refresh token is deliberately absent. It travels only as an `httpOnly`
 * cookie the API sets, so no script on the page can read it — returning it in
 * the body as well would hand it straight back to JavaScript and make the
 * cookie flag decorative.
 */
export type AuthTokens = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
};

export type RefreshedAuthTokens = AuthTokens;

export type LogoutResult = {
  success: boolean;
  message: string;
};

/**
 * How far a login got (SJ-8).
 *
 * - `AUTHENTICATED` — password was enough; `tokens` is present.
 * - `MFA_REQUIRED` — the account holds a verified second factor. `mfaTicket`
 *   is present and buys exactly one call to `/auth/mfa/challenge`.
 * - `MFA_ENROLMENT_REQUIRED` — the account is privileged, has no second
 *   factor, and the grace period is over. `mfaTicket` is present and buys
 *   `/auth/mfa/enroll` and `/auth/mfa/verify`, nothing else.
 */
export type LoginStatus = 'AUTHENTICATED' | 'MFA_REQUIRED' | 'MFA_ENROLMENT_REQUIRED';

/**
 * The half-authenticated credential a two-phase login hands back. It is not an
 * access token and carries no permissions — the name is `mfaTicket` rather
 * than anything ending in "token" so that a caller reaching for it where an
 * access token belongs reads wrong at the call site.
 */
export type MfaTicket = {
  ticket: string;
  expiresIn: string;
};

/**
 * What `POST /auth/login` returns. Exactly one of `tokens` and `mfaTicket` is
 * present, decided by `status`.
 *
 * `mfaEnrolmentRequired` is the grace-period signal and is orthogonal: it can
 * be true alongside `AUTHENTICATED`, which is the whole point of a grace
 * period — the user is let in *and* told they will not be next month.
 */
export type LoginResult = {
  status: LoginStatus;
  tokens?: AuthTokens;
  mfaTicket?: MfaTicket;
  mfaEnrolmentRequired?: boolean;
  /** When the grace period ends, ISO-8601. Absent when nothing is pending. */
  mfaEnrolmentDeadline?: string;
};

/**
 * The one and only time a TOTP secret leaves the API in the clear (SJ-8).
 *
 * `secret` accompanies `otpauthUri` because a QR code is unreadable to anyone
 * using a screen reader or a desktop authenticator that takes typed input;
 * omitting it would make the feature unusable rather than more secure, since
 * the URI in the QR contains the same secret either way.
 */
export type MfaEnrolment = {
  otpauthUri: string;
  secret: string;
};

/**
 * Issued once, on successful enrolment or regeneration, and never retrievable
 * again — only hashes are stored. A client that fails to show these to the
 * user has cost them their fallback.
 */
export type MfaRecoveryCodes = {
  recoveryCodes: string[];
};

/**
 * What completing enrolment returns.
 *
 * `tokens` is present only when enrolment was reached with an enrolment
 * ticket — a privileged user whose login was refused for want of a second
 * factor. They have no session to return to, so finishing enrolment finishes
 * the login too; making them log in again would be theatre, since they just
 * proved both factors. A user who enrolled voluntarily already has a session
 * and gets nothing extra.
 */
export type MfaEnrolmentCompleted = {
  recoveryCodes: string[];
  tokens?: AuthTokens;
};

/**
 * Whether the current user has a second factor, and whether they need one.
 * Drives the settings screen and the grace-period banner.
 */
export type MfaStatus = {
  enrolled: boolean;
  required: boolean;
  enrolledAt?: string;
  unusedRecoveryCodeCount: number;
  enrolmentDeadline?: string;
};

export type MfaResetResult = {
  success: boolean;
  message: string;
};
