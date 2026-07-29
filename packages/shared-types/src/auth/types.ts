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
export type RefreshTokenPayload = Omit<JwtPayload, 'permissions'> & {
  jti: string;
  familyId: string;
  tokenType: 'refresh';
  exp: number;
};

export type RefreshTokenRecordPayload = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type RotateRefreshTokenPayload = {
  currentTokenId: string;
  currentTokenHash: string;
  familyId: string;
  nextToken: RefreshTokenRecordPayload;
};

export type IssuedRefreshToken = {
  token: string;
  record: RefreshTokenRecordPayload;
};

export type IssueRefreshTokenInput = {
  claims: JwtPayload;
  familyId: string;
};
