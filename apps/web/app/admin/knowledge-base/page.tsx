import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { PersonalKnowledgeBasePanel } from '#components/client/personal-documents/personal-knowledge-base-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * An administrator's own knowledge base — their operational playbooks, not the
 * clinic corpus. The shared FAQ/SOP corpus is a different screen behind
 * `document.*:any` (PCS-T03), and these routes cannot reach it: the API scopes
 * every query to the caller.
 */
export default async function AdminKnowledgeBasePage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('read', 'Document')) {
    redirect('/admin/dashboard');
  }
  return <PersonalKnowledgeBasePanel />;
}
