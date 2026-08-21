import {
  decodeAccessTokenClaims,
  isAccessTokenExpired,
  type AccessTokenClaims,
} from '#lib/auth/access-token-claims';
import { decodeSessionHint } from '#lib/auth/session-hint-cookie';

type ResolveSessionClaimsInput = {
  accessToken?: string;
  sessionHint?: string;
};

/**
 * Who the request belongs to, for server-rendering decisions (SJ-6).
 *
 * The access token is preferred and authoritative — it is signed, and it is
 * what every API call actually presents. The session hint covers only the
 * window between the access token expiring and the client refreshing it:
 * without it, reloading a page fifteen minutes after the last refresh would
 * bounce a perfectly valid session to the login screen.
 *
 * This fallback used to decode the refresh JWT. That is gone in both
 * directions now — the refresh token is opaque, so there is nothing to decode,
 * and it is path-scoped to the API, so this tier never receives it.
 */
export function resolveSessionClaims({
  accessToken,
  sessionHint,
}: ResolveSessionClaimsInput): AccessTokenClaims | null {
  const hintClaims = decodeSessionHint(sessionHint);
  const accessClaims = accessToken ? decodeAccessTokenClaims(accessToken) : null;
  if (!isAccessTokenExpired(accessClaims)) {
    // The access token wins on identity, but it does not carry IMP-9's
    // disabled feature keys and never should — it is a signed credential the
    // API validates, not a place to put commercial packaging. The hint is the
    // only source, so it is merged in regardless of which side won above.
    // Without this the common case — a perfectly fresh token — would render a
    // shell with nothing hidden, which is every case that matters.
    return { ...accessClaims, disabledFeatures: hintClaims?.disabledFeatures ?? [] };
  }
  return isAccessTokenExpired(hintClaims) ? null : hintClaims;
}
