import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { ShkWorklistWorkspace } from '#components/client/maternal-care/shk-worklist-workspace';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { SHK_WORKLIST_TABS } from '#lib/maternal-care/shk-worklist-tabs';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type ShkWorklistPageProps = {
  shell: 'admin' | 'doctor';
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * The "Skrining SHK" page, shared by the clinician shell and its admin mirror
 * (P25-T10). Two gates, visibility only: a clinic without `maternal-care` has
 * no SHK tracking, and a person without `encounter.read` may not see it.
 * `FeatureGuard` and `PermissionsGuard` refuse the endpoint regardless.
 */
export async function ShkWorklistPage({ shell, searchParams }: ShkWorklistPageProps) {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!isFeatureEnabled(claims, 'maternal-care') || !ability.can('read', 'Encounter')) {
    redirect(`/${shell}/dashboard`);
  }
  const t = await getTranslations('maternalCare.shk');
  const root = await resolveShellBreadcrumbRoot(shell);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[root, { label: t('title') }]}
      />
      <ShkWorklistWorkspace
        initialTab={parseTabSearchParam(searchParams.status, SHK_WORKLIST_TABS) ?? 'DUE'}
        patientDetailBasePath={`/${shell}/patients`}
      />
    </div>
  );
}
