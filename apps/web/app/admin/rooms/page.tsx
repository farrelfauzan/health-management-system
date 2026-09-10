import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { RoomsWorkspace } from '#components/client/rooms/rooms-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { ROOMS_TABS } from '#lib/rooms/rooms-tabs';

type AdminRoomsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminRoomsPage({ searchParams }: AdminRoomsPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  const canAccess =
    ability.can('read', 'RoomClass') ||
    ability.can('read', 'Ward') ||
    ability.can('read', 'Room') ||
    ability.can('read', 'Bed');

  if (!canAccess) {
    redirect('/admin/dashboard');
  }

  return <RoomsWorkspace initialTab={parseTabSearchParam(params.tab, ROOMS_TABS)} />;
}
