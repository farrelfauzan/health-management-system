import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { BillingWorkspace } from '#components/client/billing/billing-workspace';
import { BILLING_TABS } from '#lib/billing/billing-tab';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

type AdminBillingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBillingPage({ searchParams }: AdminBillingPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  const canAccess =
    ability.can('read', 'Invoice') ||
    ability.can('read', 'ServiceTariff') ||
    ability.can('read', 'DocumentTemplate');

  if (!canAccess) {
    redirect('/admin/dashboard');
  }

  // SJ-156. The settings hub links straight to the tariffs and templates tabs;
  // an unknown or absent value leaves the workspace to pick its own default.
  return (
    <BillingWorkspace
      currentUserId={claims?.sub ?? null}
      initialTab={parseTabSearchParam(params.tab, BILLING_TABS)}
    />
  );
}
