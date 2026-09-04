import { unpackPermissionHint } from '@hms/shared-types';

import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

export const SESSION_HINT_COOKIE_NAME = 'hms_session_hint';

type SessionHint = {
  roles?: string[];
  permissions?: string[];
  packedPermissions?: string;
  disabledFeatures?: string[];
  offboardedUntil?: string;
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
    // Older hints predate the permissions field (IMP-3); they keep working
    // through the role fallback in the proxy.
    const portalPermissions = Array.isArray(parsed.permissions)
      ? parsed.permissions.filter((entry): entry is string => typeof entry === 'string')
      : [];
    // The full set, scope-stripped and grouped by resource so it fits a cookie.
    // Absent on hints written before the access token was slimmed down; those
    // still carry the `portal.*` keys above, so the shell still resolves and
    // the CASL ability falls back to the role preset exactly as it used to.
    const packedPermissions =
      typeof parsed.packedPermissions === 'string'
        ? unpackPermissionHint(parsed.packedPermissions)
        : [];
    // Union, not replacement: the `portal.*` entries keep their `:any` /
    // `:own` scope for `proxy.ts`, while the packed entries have had theirs
    // stripped. Both spellings of a portal key therefore coexist here, which
    // is harmless — `permissionToRule` maps neither to a CASL subject.
    const permissions = [...new Set([...portalPermissions, ...packedPermissions])];
    // Likewise for IMP-9's disabled feature keys. An older hint has none, and
    // the correct reading of that is "nothing is switched off" — the same
    // fail-open default the API's own guard applies.
    const disabledFeatures = Array.isArray(parsed.disabledFeatures)
      ? parsed.disabledFeatures.filter((entry): entry is string => typeof entry === 'string')
      : [];
    // P16-T41. A calendar date, and only when the API wrote one: an older
    // hint has no such field, and the right reading of that is "not
    // offboarded" — the same fail-open default as the feature keys above.
    const offboardedUntil =
      typeof parsed.offboardedUntil === 'string' && parsed.offboardedUntil !== ''
        ? parsed.offboardedUntil
        : undefined;
    return {
      roles: parsed.roles,
      permissions,
      disabledFeatures,
      ...(offboardedUntil === undefined ? {} : { offboardedUntil }),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
