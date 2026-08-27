import type { AuthTokens, LoginStatus } from '#auth/contracts';

export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
  /**
   * Permission strings granted through the user's active roles.
   *
   * On a signed access token this is the `portal.*` family **and nothing
   * else** (D-023): `proxy.ts` decides which shell a request may enter from
   * the edge runtime, where no API call is possible, and it matches these
   * keys exactly with their `:any` / `:own` scope. The full set is carried by
   * the session-hint cookie instead, packed by `packPermissionHint`, and is
   * what builds the frontend's CASL ability. It moved because a SUPER_ADMIN's
   * 127 keys made the token 4229 bytes against the browser's 4096-byte
   * per-cookie limit, so the cookie write was silently discarded.
   *
   * In-process this field still carries the complete set — `AuthService`
   * resolves it from the database and narrows it only at signing time, so
   * `IssuedSession.permissions` and the hint both see everything.
   *
   * **Advisory only** wherever it is read: the API resolves permissions from
   * the database on every request, so a claim can never grant access on its
   * own. After a role edit it stays stale until the next token refresh — an
   * accepted, visibility-only window bounded by JWT_ACCESS_EXPIRES_IN (D-022
   * in docs/MVP/decisions.md).
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
  | 'EXPIRED'
  /**
   * Nobody touched this session inside the idle threshold (SJ-9). Separate
   * from `EXPIRED`, which is the token reaching its own end of life, and from
   * `REUSE_DETECTED`, which is an accusation — a timeout is nobody's fault and
   * should not read like theft in the audit log.
   */
  | 'IDLE_TIMEOUT';

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
  /**
   * Same posture as `roles`: the hint writer keeps only the `portal.*` keys,
   * so a custom role still resolves to the right shell after the access token
   * expires (IMP-3). Never an authorisation input.
   */
  permissions: string[];
  sessionExpiresAt: Date;
};

export type ConsumeRefreshTokenResult = {
  outcome: RefreshTokenOutcome;
  userId?: string;
  familyId?: string;
};

/**
 * What a half-authenticated ticket is allowed to do (SJ-8). The claim is
 * checked against the route's declared purpose on every call, so a ticket
 * minted to answer a challenge cannot be spent enrolling a *different* second
 * factor — which would let anyone holding a stolen password replace the
 * victim's authenticator with their own.
 */
export type MfaTicketPurpose = 'mfa_challenge' | 'mfa_enrolment';

/**
 * The claims inside an `mfa_pending` ticket. Deliberately three fields: no
 * email, no roles, and above all no permissions. A ticket is a promise that a
 * password was checked, nothing more, and anything else in here would sooner
 * or later be read as authority.
 */
export type MfaTicketClaims = {
  sub: string;
  purpose: MfaTicketPurpose;
  /** Unique per ticket, so a spent one can be recognised in the audit trail. */
  jti: string;
};

/**
 * How a login ended. The controller only writes session cookies for `SESSION`,
 * which is the property that keeps a half-authenticated caller from acquiring
 * a refresh cookie: the type gives it nothing to write.
 */
export type LoginOutcome =
  | {
      kind: 'SESSION';
      session: IssuedSession;
      /** Set during the grace period: let in, and warned. */
      enrolmentRequired: boolean;
      enrolmentDeadline: Date | null;
    }
  | {
      kind: 'MFA_TICKET';
      status: Extract<LoginStatus, 'MFA_REQUIRED' | 'MFA_ENROLMENT_REQUIRED'>;
      ticket: string;
      expiresIn: string;
    };

/**
 * A user's second factor as the service layer sees it — the secret already
 * decrypted by the repository, because ciphertext must not travel past that
 * boundary.
 */
export type MfaCredentialSnapshot = {
  userId: string;
  secret: string;
  verifiedAt: Date | null;
  /**
   * The RFC 6238 counter of the last code accepted for this user, or null when
   * none has been. Rejecting anything at or below it is what stops a code
   * being replayed for the remainder of its 30-second step.
   */
  lastAcceptedTimeStep: number | null;
};

/**
 * What the service hands the repository to store. The secret is plaintext
 * here on purpose: sealing is the repository's job, because ciphertext must
 * not exist above that boundary.
 */
export type MfaCredentialPayload = {
  userId: string;
  secret: string;
};

export type MfaRecoveryCodePayload = {
  userId: string;
  codeHash: string;
};

/**
 * Whether this account must hold a second factor, and by when. Derived from
 * the user's resolved permissions on every evaluation — never cached on the
 * user row, so revoking a privileged role stops requiring MFA immediately and
 * granting one starts requiring it immediately.
 */
export type MfaRequirement = {
  isPrivileged: boolean;
  /** Which permission keys triggered it. Empty when not privileged. */
  matchedPermissions: string[];
  /** Null once the grace period has elapsed, or when there never was one. */
  graceUntil: Date | null;
  isWithinGrace: boolean;
};

/**
 * Why a challenge was refused. `INVALID_CODE` and `REPLAYED_CODE` are separate
 * internally so the audit row can tell them apart, and identical to the caller
 * — a client that learns its code was *right but already used* learns that it
 * guessed a real code.
 */
export type MfaChallengeFailure = 'INVALID_CODE' | 'REPLAYED_CODE' | 'INVALID_RECOVERY_CODE';
