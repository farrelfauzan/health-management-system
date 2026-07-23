export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
};

export type RefreshTokenPayload = JwtPayload & {
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
