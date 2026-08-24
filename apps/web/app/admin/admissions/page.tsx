import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { AdmissionsWorkspace } from '#components/client/admissions/admissions-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

export default async function AdminAdmissionsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!ability.can('read', 'Admission')) {
    redirect('/admin/dashboard');
  }

  return <AdmissionsWorkspace />;
}
