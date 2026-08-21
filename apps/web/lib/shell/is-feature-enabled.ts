import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

/**
 * Whether one feature key is switched on for this client (IMP-9).
 *
 * Reads the disabled set rather than an enabled one, so a claim set carrying
 * no feature information at all — an older session hint, or a cold load before
 * the first refresh — answers `true` for everything. Hiding a feature the
 * clinic paid for is the worse failure; the API refuses the routes either way.
 */
export function isFeatureEnabled(claims: AccessTokenClaims | null, featureKey: string): boolean {
  return !(claims?.disabledFeatures ?? []).includes(featureKey);
}
