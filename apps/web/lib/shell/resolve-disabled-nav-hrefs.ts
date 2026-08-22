import { FEATURE_CATALOG } from '@hms/shared-types';

import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

/**
 * The nav routes to hide, given the disabled feature keys on the session
 * claims (IMP-9).
 *
 * A route is hidden only when **every** feature that owns it is disabled.
 * `/admin/integrations` is the case that forces this: `bpjs-pcare`,
 * `bpjs-antrean` and `satusehat` all list it, so hiding on the first disabled
 * owner would take the whole screen away from a clinic that bought two of the
 * three. The rule generalises — a shared route is only dead once nothing
 * behind it is live.
 *
 * The mapping comes from `FEATURE_CATALOG.navHrefs` rather than a table in
 * this app, so "what disappears when this feature is off" has exactly one
 * answer on both sides of the wire. A key the catalog does not know owns
 * nothing and therefore hides nothing: an API newer than this bundle may name
 * a feature whose routes do not exist here yet.
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

  const ownersByHref = new Map<string, string[]>();
  for (const entry of FEATURE_CATALOG) {
    for (const href of entry.navHrefs) {
      ownersByHref.set(href, [...(ownersByHref.get(href) ?? []), entry.key]);
    }
  }

  return Array.from(ownersByHref)
    .filter(([, owners]) => owners.every((key) => disabledKeys.has(key)))
    .map(([href]) => href);
}
