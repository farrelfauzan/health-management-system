import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { LabIntakeWorkspace } from '#components/client/laboratory/lab-intake-workspace';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

/**
 * Front-desk intake for a request that did not come from a consultation
 * (`P18-T10`).
 *
 * Gated on `write` rather than `read`: raising a request against a visit that
 * has no attending practitioner is the front desk's act, and the API refuses
 * it to anyone holding only the own-scope grant. Visibility only — the
 * `PermissionsGuard` refuses the endpoint regardless.
 */
export default async function AdminLaboratoryIntakePage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'laboratory')) {
    redirect('/admin/dashboard');
  }
  if (!ability.can('write', 'LabOrder')) {
    redirect(ability.can('read', 'LabOrder') ? '/admin/laboratory' : '/admin/dashboard');
  }

  const t = await getTranslations('operations.laboratory.intake');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[t('title')]}
      />
      <LabIntakeWorkspace />
    </div>
  );
}
