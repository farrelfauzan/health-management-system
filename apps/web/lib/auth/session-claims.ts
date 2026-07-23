import {
  decodeAccessTokenClaims,
  isAccessTokenExpired,
  type AccessTokenClaims,
} from '#lib/auth/access-token-claims';

type ResolveSessionClaimsInput = {
  accessToken?: string;
  refreshToken?: string;
};

export function resolveSessionClaims({
  accessToken,
  refreshToken,
}: ResolveSessionClaimsInput): AccessTokenClaims | null {
  const accessClaims = accessToken ? decodeAccessTokenClaims(accessToken) : null;
  if (!isAccessTokenExpired(accessClaims)) {
    return accessClaims;
  }
  const refreshClaims = refreshToken ? decodeAccessTokenClaims(refreshToken) : null;
  return isAccessTokenExpired(refreshClaims) ? null : refreshClaims;
}
