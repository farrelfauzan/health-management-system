import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LabCatalogPanel } from '#components/client/laboratory/lab-catalog-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

/**
 * The laboratory catalog settings screen (`P18-T01`).
 *
 * Two gates, and they refuse for different reasons: a clinic without the
 * `laboratory` entitlement has no lab at all, and a person without
 * `lab-test.read:any` has one they may not look at. Both redirect rather than
 * render an empty screen, and both are visibility only — `FeatureGuard` and
 * `PermissionsGuard` refuse the endpoints regardless.
 */
export default async function AdminLaboratorySettingsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'laboratory') || !ability.can('read', 'LabTest')) {
    redirect('/admin/dashboard');
  }

  return <LabCatalogPanel />;
}
