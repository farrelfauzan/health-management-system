import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { TaxSettingsTabs } from '#components/client/taxes/tax-settings-tabs';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';
import { TAX_SETTINGS_TABS } from '#lib/taxes/tax-settings-tabs';

type AdminTaxSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The clinic's tax settings (`P27-T02`), tax codes and the code on every
 * tariff and medication (`P27-T03`). Two gates, as on the laboratory
 * settings: a clinic without the `taxes` entitlement has no tax page, and a
 * person without `tax-settings.read:any` may not look at it. Both redirect,
 * and both are visibility only — the API refuses regardless.
 */
export default async function AdminTaxSettingsPage({ searchParams }: AdminTaxSettingsPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'taxes') || !ability.can('read', 'TaxSettings')) {
    redirect('/admin/dashboard');
  }

  // P27-T03. The Kode pajak and Tarif & obat tabs need `tax-code.read:any`;
  // without it the page is the profile alone.
  return (
    <TaxSettingsTabs
      initialTab={parseTabSearchParam(params.tab, TAX_SETTINGS_TABS)}
      canReadTaxCodes={ability.can('read', 'TaxCode')}
    />
  );
}
