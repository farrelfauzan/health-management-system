export type AccessTokenClaims = {
  sub?: string;
  email?: string;
  exp?: number;
  role?: string;
  roles?: string[];
  permissions?: string[];
  /**
   * Feature keys this client may not use (IMP-9). Carried by the session-hint
   * cookie only — never by the access token, which is signed and presented to
   * the API, and has no business carrying commercial packaging.
   *
   * Undefined means "hide nothing", not "hide everything": a hint issued
   * before this field existed must not blank the sidebar.
   */
  disabledFeatures?: string[];
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

/**
 * Whether the claim set carries a given permission key (IMP-3). Like every
 * read of these claims, this is a navigation input only — the backend
 * PermissionsGuard re-resolves permissions from the database on each request.
 */
export function hasPermission(claims: AccessTokenClaims | null, permissionKey: string): boolean {
  return claims?.permissions?.includes(permissionKey) ?? false;
}
