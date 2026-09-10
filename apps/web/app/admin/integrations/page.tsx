import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { IntegrationsPanel } from '#components/client/integrations/integrations-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { INTEGRATIONS_TABS } from '#lib/integrations/integrations-tabs';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

type AdminIntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  const canAccess =
    ability.can('read', 'BpjsSubmission') ||
    ability.can('read', 'SatusehatSubmission') ||
    ability.can('manage', 'BpjsConfig') ||
    ability.can('manage', 'BpjsMapping');

  if (!canAccess) {
    redirect('/admin/dashboard');
  }

  return <IntegrationsPanel initialTab={parseTabSearchParam(params.tab, INTEGRATIONS_TABS)} />;
}
