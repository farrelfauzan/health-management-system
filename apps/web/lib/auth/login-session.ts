import type { AuthTokens } from '@hms/shared-types';

import { setAccessTokenCookie } from '#lib/auth/access-token-cookie';

/**
 * Persists what the browser is allowed to hold after a login (SJ-6): the
 * short-lived access token, and nothing else. The refresh token never reaches
 * this tier — the API returns it as an `httpOnly` cookie, so there is no
 * value here to store and no way for a script to read one.
 */
export function persistLoginSession(tokens: AuthTokens): void {
  setAccessTokenCookie(tokens.accessToken);
}
