import { FEATURE_CATALOG } from '@hms/shared-types';

import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

/**
 * The nav routes to hide, given the disabled feature keys on the session
 * claims (IMP-9).
 *
 * The mapping comes from `FEATURE_CATALOG.navHrefs` rather than a table in
 * this app, so "what disappears when this feature is off" has exactly one
 * answer on both sides of the wire. A key the catalog does not know is
 * ignored: an API newer than this bundle may name a feature whose routes do
 * not exist here yet, and hiding nothing is the right response to that.
 *
 * This is **visibility only**. `FeatureGuard` refuses the endpoints behind
 * these routes whatever the sidebar shows, exactly as `PermissionsGuard`
 * does for the ability checks alongside it.
 */
export function resolveDisabledNavHrefs(claims: AccessTokenClaims | null): string[] {
  const disabledKeys = new Set(claims?.disabledFeatures ?? []);

  if (disabledKeys.size === 0) {
    return [];
  }

  return FEATURE_CATALOG.filter((entry) => disabledKeys.has(entry.key)).flatMap((entry) => [
    ...entry.navHrefs,
  ]);
}
