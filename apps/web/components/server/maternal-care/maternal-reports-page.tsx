import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { MaternalReportsWorkspace } from '#components/client/maternal-care/maternal-reports-workspace';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { MATERNAL_REPORT_TABS } from '#lib/maternal-reports/maternal-report-tabs';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type MaternalReportsPageProps = {
  shell: 'admin' | 'doctor';
  searchParams: Record<string, string | string[] | undefined>;
};

const MONTH_LENGTH = 7;

/**
 * The "Laporan KIA" page (P25-T15), shared by the clinician shell and its
 * admin mirror like the SHK worklist. Two gates, visibility only: a clinic
 * without `maternal-care` has no registers, and only a holder of
 * `maternal-report.read` — a clinician — may see them. `FeatureGuard` and
 * `PermissionsGuard` refuse the endpoints regardless.
 */
export async function MaternalReportsPage({ shell, searchParams }: MaternalReportsPageProps) {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!isFeatureEnabled(claims, 'maternal-care') || !ability.can('read', 'MaternalReport')) {
    redirect(`/${shell}/dashboard`);
  }
  const t = await getTranslations('maternalCare.reports');
  const root = await resolveShellBreadcrumbRoot(shell);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[root, { label: t('title') }]}
      />
      <MaternalReportsWorkspace
        initialTab={parseTabSearchParam(searchParams.tab, MATERNAL_REPORT_TABS) ?? 'kohort-ibu'}
        initialMonth={resolveClinicToday().slice(0, MONTH_LENGTH)}
      />
    </div>
  );
}
