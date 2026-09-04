import { packPermissionHint } from '@hms/shared-types';

import { RefreshTokenCookieWriter } from '../auth.types';
import { PORTAL_PERMISSION_PREFIX } from '../portal-permission-prefix';

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
 * What makes this safe is what it is *not*. It carries roles, the disabled
 * feature keys, and an expiry — no signature anybody checks, no bearer value,
 * no identifier
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
  hint: {
    roles: readonly string[];
    permissions: readonly string[];
    /**
     * The feature keys this client may **not** use (IMP-9).
     *
     * Disabled rather than enabled, for two reasons that both reduce to the
     * same rule: absence must mean "hide nothing". A hint written before this
     * field existed has no `disabledFeatures`, and a client whose cookie was
     * issued by an older API must not lose its navigation — with an enabled
     * list, an empty array and a missing one are indistinguishable and both
     * would blank the sidebar. It is also the same fail-open default
     * `FeatureAvailabilityCacheService` and `FeatureEntitlementService` apply,
     * expressed once more rather than inverted here.
     */
    disabledFeatures: readonly string[];
    /**
     * When the person's offboarding window closes (P16-T41), or null. Written
     * as a calendar date under `offboardedUntil` so the web tier can show
     * "your documents are deleted on the 4th" and pin navigation to the vault
     * without a lookup. Absent from the cookie entirely for everyone else —
     * a hint written by an older API has no such field, and the right reading
     * of that is "not offboarded".
     */
    offboardingDeadline: Date | null;
    expiresAt: Date;
  },
): void {
  const portalPermissions = hint.permissions.filter((permissionKey) =>
    permissionKey.startsWith(PORTAL_PERMISSION_PREFIX),
  );
  const payload = Buffer.from(
    JSON.stringify({
      roles: hint.roles,
      // Scope intact and unpacked, because `proxy.ts` matches these exactly.
      permissions: portalPermissions,
      // Everything the caller holds, in the compact grouped form. This used to
      // live in the JWT and pushed it past the browser's 4096-byte cookie
      // limit, so the token was silently dropped and the whole admin shell
      // rendered from a fallback preset. See `packPermissionHint`.
      packedPermissions: packPermissionHint(hint.permissions),
      disabledFeatures: hint.disabledFeatures,
      ...(hint.offboardingDeadline === null
        ? {}
        : { offboardedUntil: hint.offboardingDeadline.toISOString().slice(0, 10) }),
      exp: Math.floor(hint.expiresAt.getTime() / 1000),
    }),
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
