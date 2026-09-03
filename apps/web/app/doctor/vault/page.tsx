import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { VaultPanel } from '#components/client/vault-documents/vault-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The caller's own document vault, inside the doctor shell.
 *
 * Two entry points to one panel, as with the assistant and the knowledge
 * base: `proxy.ts` gates by path prefix, so a single route would bounce one
 * of the two roles that has a vault before the page ever rendered. The panel
 * is identical because a vault is per person, not per portal.
 *
 * Deliberately **not** merged with the knowledge-base page (FR-E3-06). The
 * two hold the same file types, and the difference between them is whether a
 * document's passages reach an AI provider — a distinction that must not be
 * one mis-click wide.
 */
export default async function DoctorVaultPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  // Visibility only, and it cannot see the scope: `permissionToRule` drops the
  // `:own` / `:any` suffix. Whose documents come back is the API's decision,
  // and for this surface no `:any` key exists at all.
  if (!ability.can('read', 'VaultDocument')) {
    redirect('/doctor/dashboard');
  }
  return <VaultPanel />;
}
