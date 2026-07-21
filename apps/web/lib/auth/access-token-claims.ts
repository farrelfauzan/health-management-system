export type AccessTokenClaims = {
  sub?: string;
  email?: string;
  exp?: number;
  role?: string;
  roles?: string[];
  permissions?: string[];
};

export function decodeAccessTokenClaims(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  const payloadBase64 = parts[1];

  if (parts.length < 2 || !payloadBase64) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf8'),
    ) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(claims: AccessTokenClaims | null): boolean {
  if (!claims?.exp) {
    return true;
  }

  const currentUnix = Math.floor(Date.now() / 1000);
  return claims.exp <= currentUnix;
}

export function hasAnyRole(claims: AccessTokenClaims | null, roles: string[]): boolean {
  if (!claims) {
    return false;
  }

  const claimedRoles = new Set([...(claims.roles ?? []), ...(claims.role ? [claims.role] : [])]);

  return roles.some((role) => claimedRoles.has(role));
}
