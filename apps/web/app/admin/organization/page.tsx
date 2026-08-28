import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { OrganizationWorkspace } from '#components/client/organization/organization-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The org chart (SJ-1).
 *
 * Gated on `read` alone. An account that may look but not edit belongs here —
 * it gets the same tree with no edit controls, which is the whole reason the
 * API splits the read grant from the manage grant. `proxy.ts` has already
 * established that this is an admin session; this decides only whether the
 * feature is theirs.
 */
export default async function AdminOrganizationPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!ability.can('read', 'OrganizationUnit')) {
    redirect('/admin/dashboard');
  }

  return <OrganizationWorkspace />;
}
