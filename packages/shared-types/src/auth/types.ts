import type { AuthTokens } from '#auth/contracts';

export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
  /**
   * Permission strings (`patient.read:any`) granted through the user's active
   * roles. Carried so the frontend can build its CASL ability from the same
   * model the backend enforces, instead of inferring capability from role
   * names. **Advisory only**: the API resolves permissions from the database
   * on every request, so a token claim can never grant access on its own.
   */
  permissions: string[];
};

/**
 * The refresh token deliberately omits `permissions`: refreshing re-reads the
 * user from the database, so a copy in the token would only add bulk and risk
 * being mistaken for a source of truth after a grant is revoked.
 */
export type RefreshTokenRecordPayload = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * The stored side of a refresh token (SJ-6). No plaintext anywhere: the token
 * is opaque random and only its SHA-256 is persisted, so this record cannot be
 * turned back into something a caller could present.
 */
export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

export type IssuedRefreshToken = {
  token: string;
  record: RefreshTokenRecordPayload;
};

export type IssueRefreshTokenInput = {
  userId: string;
  familyId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Why a presented refresh token was refused, or how it was accepted. The
 * caller maps this onto an HTTP response and an audit decision — the
 * distinction between `REUSE_DETECTED` and `INVALID` is the difference between
 * "someone replayed a token" and "that string means nothing here".
 */
export type RefreshTokenOutcome =
  | 'ROTATED'
  | 'GRACE_REISSUED'
  | 'REUSE_DETECTED'
  | 'INVALID'
  | 'EXPIRED';

/**
 * What the auth service hands the controller: the body the client sees, plus
 * the refresh token the controller turns into an `httpOnly` cookie. Kept apart
 * so the token cannot be returned in a response body by accident — the type
 * makes the cookie the only exit.
 */
export type IssuedSession = {
  tokens: AuthTokens;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
  /** Feeds the session-hint cookie: rendering input, never authorisation. */
  roles: string[];
  sessionExpiresAt: Date;
};

export type ConsumeRefreshTokenResult = {
  outcome: RefreshTokenOutcome;
  userId?: string;
  familyId?: string;
};
