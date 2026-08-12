import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { AiProvidersPanel } from '#components/client/ai-providers/ai-providers-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

export default async function AdminAiProvidersPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('read', 'AiProviderConfig')) {
    redirect('/admin/dashboard');
  }

  // Read and write are separate grants, so a read-only holder sees the list
  // without the buttons. The backend guard remains the source of truth.
  return <AiProvidersPanel canWrite={ability.can('write', 'AiProviderConfig')} />;
}
