import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { PersonalKnowledgeBasePanel } from '#components/client/personal-documents/personal-knowledge-base-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * A clinician's own knowledge base, inside the doctor shell.
 *
 * It exists as a separate page from the admin one because `proxy.ts` gates by
 * path prefix — a doctor holding `document.read:own` would be bounced from
 * `/admin/*` before this ever rendered. Same panel, two entry points, as with
 * the assistant.
 */
export default async function DoctorKnowledgeBasePage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  // Visibility only, and it cannot see the scope: `permissionToRule` drops the
  // `:own` / `:any` suffix. Whose documents come back is the API's decision.
  if (!ability.can('read', 'Document')) {
    redirect('/doctor/dashboard');
  }
  return <PersonalKnowledgeBasePanel />;
}
