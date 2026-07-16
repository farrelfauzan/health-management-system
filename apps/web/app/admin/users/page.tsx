import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { AdminUsersPanel } from '#components/client/admin-users-panel';
import { AdminUsersShell } from '#components/server/admin-users-shell';
import { parseAdminUsersSearchParams } from '#lib/admin-users/search-params';
import { decodeAccessTokenClaims, isAccessTokenExpired } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const query = parseAdminUsersSearchParams(await searchParams);
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = accessToken ? decodeAccessTokenClaims(accessToken) : null;

  if (!accessToken || isAccessTokenExpired(claims)) {
    redirect('/');
  }

  const rules = resolveAppAbilityRules(claims);
  const ability = buildAppAbility(rules);

  if (!ability.can('read', 'User')) {
    redirect('/');
  }

  return (
    <AdminUsersShell>
      <AdminUsersPanel initialQuery={query} initialHasAccessToken={Boolean(accessToken)} />
    </AdminUsersShell>
  );
}
