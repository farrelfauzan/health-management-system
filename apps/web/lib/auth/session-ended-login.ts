/**
 * Where the browser goes once its session is over: the refresh failed, or the
 * user signed out or locked the workstation.
 *
 * Not plain `/login`, because a plain `/login` is not a logged-out state here.
 * The API's session-hint cookie (`hms_session_hint`, SJ-6) outlives the access
 * token by design, and `proxy.ts` reads it to send a signed-in visitor of
 * `/login` back to their shell. When the server killed the refresh family — a
 * logout on another device, reuse detection, an admin revoking sessions — the
 * hint is still there, so `/login` bounced the user to their dashboard, whose
 * first API call 401'd, and round again.
 *
 * The browser cannot reliably clear that cookie itself: the API writes it
 * `Secure`, and it is the API's cookie, not this tier's. So the marker asks
 * `proxy.ts` to do it — it deletes the access token and the hint on the edge
 * response and redirects to plain `/login`, which then renders.
 */
export const SESSION_ENDED_LOGIN = {
  param: 'ended',
  href: '/login?ended=1',
} as const;
