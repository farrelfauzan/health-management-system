import { RefreshTokenCookieWriter } from '../auth.types';

export const SESSION_HINT_COOKIE_NAME = 'hms_session_hint';

/**
 * Readable by the web tier, unlike the refresh cookie — that is the entire
 * reason it exists.
 */
const SESSION_HINT_COOKIE_PATH = '/';

/**
 * A non-credential hint that lets the Next.js server render the right shell on
 * a cold page load (SJ-6).
 *
 * Some background, because a second cookie next to an `httpOnly` one looks
 * like a hole until you know what is in it. Before this ticket the web tier
 * decoded the *refresh JWT* to recover the user's roles whenever the access
 * token had expired. SJ-6 removed both halves of that: the refresh token is
 * now opaque, so there is nothing to decode, and it is path-scoped to the API,
 * so the Next server never receives it. Without a replacement, reloading a
 * page fifteen minutes after the last refresh bounces a perfectly valid
 * session to the login screen.
 *
 * What makes this safe is what it is *not*. It carries roles and an expiry and
 * nothing else — no signature anybody checks, no bearer value, no identifier
 * the API will accept. Presenting it to the API achieves exactly nothing;
 * every route still demands the access token, and `PermissionsGuard` still
 * re-reads permissions from the database on every request. It is a rendering
 * hint, and a forged one costs an attacker a wrong-looking sidebar.
 *
 * It is deliberately *not* `httpOnly`: the whole point is that both the Next
 * server and the browser can read it. That exposes no more than the
 * access-token cookie already does, which this tier has always read from
 * JavaScript.
 */
export function setSessionHintCookie(
  response: RefreshTokenCookieWriter,
  hint: { roles: readonly string[]; expiresAt: Date },
): void {
  const payload = Buffer.from(
    JSON.stringify({ roles: hint.roles, exp: Math.floor(hint.expiresAt.getTime() / 1000) }),
  ).toString('base64url');
  response.cookie(SESSION_HINT_COOKIE_NAME, payload, {
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    path: SESSION_HINT_COOKIE_PATH,
    maxAge: Math.max(0, hint.expiresAt.getTime() - Date.now()),
  });
}

export function clearSessionHintCookie(response: RefreshTokenCookieWriter): void {
  response.clearCookie(SESSION_HINT_COOKIE_NAME, {
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    path: SESSION_HINT_COOKIE_PATH,
  });
}
