import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { LabWorklistWorkspace } from '#components/client/laboratory/lab-worklist-workspace';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { parseLabWorklistSearchParams } from '#lib/laboratory/worklist-search-params';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type AdminLaboratoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The bench's worklist (`P18-T08`): the screen that decides whether the module
 * is used or bypassed with a paper book.
 *
 * Two gates, refusing for different reasons: a clinic without the `laboratory`
 * entitlement has no lab, and a person without `lab-order.read` has one they
 * may not look at. Somebody who may only read the catalog is sent there
 * instead — the nav entry opens for them too, and a redirect beats an empty
 * list. Visibility only; `FeatureGuard` and `PermissionsGuard` refuse the
 * endpoints regardless.
 */
export default async function AdminLaboratoryPage({ searchParams }: AdminLaboratoryPageProps) {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'laboratory')) {
    redirect('/admin/dashboard');
  }
  if (!ability.can('read', 'LabOrder')) {
    redirect(ability.can('read', 'LabTest') ? '/admin/settings/laboratory' : '/admin/dashboard');
  }

  const t = await getTranslations('operations.laboratory.worklist');
  const root = await resolveShellBreadcrumbRoot();
  const query = parseLabWorklistSearchParams(await searchParams);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[root, { label: t('title') }]}
      />
      <LabWorklistWorkspace initialQuery={query} />
    </div>
  );
}
