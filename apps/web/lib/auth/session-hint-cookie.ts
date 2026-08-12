import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

export const SESSION_HINT_COOKIE_NAME = 'hms_session_hint';

type SessionHint = {
  roles?: string[];
  exp?: number;
};

/**
 * Decodes the API's session-hint cookie into the same claim shape the rest of
 * the gating code already speaks (SJ-6).
 *
 * This is a **rendering hint and nothing more**. It replaces what used to be a
 * decode of the refresh JWT — now impossible, because the refresh token is
 * opaque and scoped to the API's own path — and it is trusted for exactly one
 * thing: choosing which shell to render before the client has refreshed. It is
 * never an authorisation input. Every API call still carries the access token,
 * and the backend `PermissionsGuard` re-reads permissions from the database on
 * every request, so a forged hint buys an attacker a misleading sidebar and no
 * data whatsoever.
 */
export function decodeSessionHint(hint: string | undefined): AccessTokenClaims | null {
  if (!hint) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(hint, 'base64url').toString('utf8')) as SessionHint;
    if (!Array.isArray(parsed.roles) || typeof parsed.exp !== 'number') {
      return null;
    }
    return { roles: parsed.roles, exp: parsed.exp };
  } catch {
    return null;
  }
}
