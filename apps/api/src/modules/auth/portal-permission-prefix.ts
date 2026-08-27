/**
 * The one permission family that belongs in the access token.
 *
 * `proxy.ts` decides which shell a request may enter, and it runs in the edge
 * runtime — no database, no API call, only what the cookies carry. So the
 * `portal.*` keys ride in the JWT with their `:any` / `:own` scope intact,
 * because the proxy matches them exactly. Every other permission is
 * visibility-only data and travels in the session hint instead, which is what
 * kept the token under the browser's 4096-byte cookie limit.
 *
 * Shared by the signer (`AuthService.issueAccessToken`) and the hint writer
 * (`setSessionHintCookie`) so the two halves of that split cannot drift.
 */
export const PORTAL_PERMISSION_PREFIX = 'portal.';
