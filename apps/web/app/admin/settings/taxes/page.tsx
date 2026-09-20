import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { TaxSettingsPanel } from '#components/client/taxes/tax-settings-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

/**
 * The clinic's tax settings (`P27-T02`). Two gates, as on the laboratory
 * settings: a clinic without the `taxes` entitlement has no tax page, and a
 * person without `tax-settings.read:any` may not look at it. Both redirect,
 * and both are visibility only — the API refuses regardless.
 */
export default async function AdminTaxSettingsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'taxes') || !ability.can('read', 'TaxSettings')) {
    redirect('/admin/dashboard');
  }

  return <TaxSettingsPanel />;
}
