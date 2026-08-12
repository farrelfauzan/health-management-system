import { RefreshTokenCookieCarrier, RefreshTokenCookieWriter } from '../auth.types';

export const REFRESH_TOKEN_COOKIE_NAME = 'hms_refresh_token';

/**
 * Path-scoped so the browser sends the refresh token to the one endpoint that
 * consumes it and to nothing else (SJ-6). A `Path=/` refresh cookie rides
 * along on every API call, which multiplies the number of requests that could
 * leak it — logs, proxies, an XSS-adjacent misconfiguration — for no benefit,
 * since only this route ever reads it.
 */
const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

/**
 * Writes the refresh token as an `httpOnly` cookie.
 *
 * `httpOnly` is the point of the whole exercise: the previous implementation
 * set this cookie from browser JavaScript, which means any script running on
 * the page could read it — and a refresh token is the long-lived half of the
 * session. The browser now holds it somewhere the page cannot reach.
 *
 * `SameSite=Strict` because the refresh endpoint is never a legitimate
 * cross-site destination; nothing should be able to spend a refresh token as a
 * side effect of the user visiting another page.
 *
 * `Secure` follows the deployment. Browsers treat `http://localhost` as a
 * secure context and accept `Secure` cookies there, so development is
 * unaffected; a non-localhost HTTP deployment would silently drop the cookie,
 * which is the correct outcome — sending it in clear is worse than failing.
 */
export function setRefreshTokenCookie(
  response: RefreshTokenCookieWriter,
  refreshToken: string,
  maxAgeMs: number,
): void {
  response.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: maxAgeMs,
  });
}

export function clearRefreshTokenCookie(response: RefreshTokenCookieWriter): void {
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}

/**
 * Reads the one cookie this API cares about straight from the header.
 *
 * Values are matched on an exact name, not a prefix: `hms_refresh_token_x=`
 * must not satisfy a lookup for `hms_refresh_token`. Decoding is defensive —
 * `res.cookie` percent-encodes, and although base64url happens to survive that
 * untouched, relying on the coincidence would break the day the token format
 * changes.
 */
export function readRefreshTokenCookie(request: RefreshTokenCookieCarrier): string | undefined {
  const header = request.headers?.cookie;
  if (!header) {
    return undefined;
  }
  for (const entry of header.split(';')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    if (entry.slice(0, separatorIndex).trim() !== REFRESH_TOKEN_COOKIE_NAME) {
      continue;
    }
    const rawValue = entry.slice(separatorIndex + 1).trim();
    return rawValue.length > 0 ? safeDecode(rawValue) : undefined;
  }
  return undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
