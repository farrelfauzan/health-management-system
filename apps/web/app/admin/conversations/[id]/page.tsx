import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { ConversationTranscriptPanel } from '#components/client/conversations/conversation-transcript-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

type AdminConversationPageProps = {
  params: Promise<{ id: string }>;
};

/** One conversation's transcript, takeover controls, and reply composer. */
export default async function AdminConversationPage({ params }: AdminConversationPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('read', 'Conversation')) {
    redirect('/admin/dashboard');
  }
  return <ConversationTranscriptPanel conversationId={id} />;
}
