import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { AiAssistantPanel } from '#components/client/ai-assistant/ai-assistant-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

export default async function AdminAiAssistantPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('create', 'ChatSession')) {
    redirect('/admin/dashboard');
  }
  // The signed-in name now reaches the conversation through
  // `AiAssistantProvider` in the layout, which is where the thread lives.
  return <AiAssistantPanel />;
}
