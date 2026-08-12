import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { ConversationInboxPanel } from '#components/client/conversations/conversation-inbox-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The WhatsApp/Telegram inbox (`PCS-T08`, strategy §4.2).
 *
 * The ability check is visibility only, as everywhere else — but unlike the
 * clinic-corpus screen next to it, there is no scope ambiguity underneath:
 * `conversation.read` exists solely as `:any`, because a conversation has no
 * HMS user on either end for an `:own` grant to resolve against. `proxy.ts`
 * admits only `ADMIN` and `SUPER_ADMIN` under `/admin`, and the API's guard
 * decides the rest.
 */
export default async function AdminConversationsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('read', 'Conversation')) {
    redirect('/admin/dashboard');
  }
  return <ConversationInboxPanel />;
}
