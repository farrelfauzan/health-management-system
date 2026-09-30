import type { AccessTokenClaims } from '#lib/auth/access-token-claims';
import { ANALYTICS_DASHBOARDS } from '#lib/analytics/analytics-dashboards';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

/**
 * The analytics dashboards to hide because the module they report on is off
 * (P29-T13): Farmasi without the pharmacy module, Laboratorium without the
 * laboratory module. `resolveDisabledNavHrefs`
 * cannot say this, since it hides a route only when every feature owning it
 * is off, and `analytics` owns them all. Visibility only; the API refuses.
 */
export function resolveDisabledAnalyticsHrefs(claims: AccessTokenClaims | null): string[] {
  return ANALYTICS_DASHBOARDS.filter(
    (dashboard) =>
      dashboard.requiredFeature !== undefined &&
      !isFeatureEnabled(claims, dashboard.requiredFeature),
  ).map((dashboard) => dashboard.href);
}
