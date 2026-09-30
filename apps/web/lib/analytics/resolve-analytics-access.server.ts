import type { FeatureKey } from '@hms/shared-types';
import { buildAppAbility, type AppAbility } from '@hms/ui';
import { cookies } from 'next/headers';

import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

export type AnalyticsAccess = {
  isEnabled: boolean;
  /** Whether a module a dashboard reports on is on, e.g. `pharmacy`. */
  hasFeature: (featureKey: FeatureKey) => boolean;
  ability: AppAbility;
};

/**
 * The viewer's analytics entitlement and ability, read from the session
 * cookies. Visibility only: every analytics endpoint is refused by the API's
 * guards whatever this says.
 */
export async function resolveAnalyticsAccess(): Promise<AnalyticsAccess> {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  return {
    isEnabled: isFeatureEnabled(claims, 'analytics'),
    hasFeature: (featureKey) => isFeatureEnabled(claims, featureKey),
    ability: buildAppAbility(resolveAppAbilityRules(claims)),
  };
}
