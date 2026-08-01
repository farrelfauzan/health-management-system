import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { AiAssistantPanel } from '#components/client/ai-assistant/ai-assistant-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The assistant inside the doctor shell. It exists because `proxy.ts` gates by
 * path prefix: doctors hold `chat.session.create:own`, but every entry point
 * pointed at `/admin/ai-assistant`, which the gate bounces for anyone without
 * an admin session — so a clinician granted the assistant could never open it.
 */
export default async function DoctorAiAssistantPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('create', 'ChatSession')) {
    redirect('/doctor/dashboard');
  }
  return <AiAssistantPanel />;
}
