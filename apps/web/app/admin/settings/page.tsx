import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SettingsHubGrid } from '#components/client/settings/settings-hub-grid';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { resolveVisibleSettingsHubCards } from '#lib/settings/settings-hub-cards';
import { resolveDisabledNavHrefs } from '#lib/shell/resolve-disabled-nav-hrefs';

/**
 * The settings hub (SJ-156): one place for the configuration that lived
 * behind seven screens, none of them called "settings". Cards link; nothing
 * moves — every existing route and deep link keeps working.
 *
 * Which cards render is decided here, from the session, for the reason the
 * sidebar is: an operator sees only what they may change, and a feature the
 * clinic did not buy has no card. Visibility only — each destination gates
 * itself again, and the API refuses regardless.
 */
export default async function AdminSettingsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  const cards = resolveVisibleSettingsHubCards({
    ability,
    disabledNavHrefs: resolveDisabledNavHrefs(claims),
  });

  if (cards.length === 0) {
    redirect('/admin/dashboard');
  }

  const t = await getTranslations('operations.settings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <SettingsHubGrid cardKeys={cards.map((card) => card.key)} />
    </div>
  );
}
