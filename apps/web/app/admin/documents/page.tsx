import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { DocumentsWorkspace } from '#components/client/managed-documents/documents-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

/**
 * The documents module (`P16-T31`): the registry, the caller's own approval
 * queue, and the type settings.
 *
 * Gated on the registry read alone. An account that may look but not edit
 * belongs here — it gets the type list with no controls, which is why the
 * API splits the read grant from the type write. `proxy.ts` has already
 * established that this is an admin session; this decides only whether the
 * feature is theirs.
 */
export default async function AdminDocumentsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!ability.can('read', 'ManagedDocument')) {
    redirect('/admin/dashboard');
  }

  return (
    <DocumentsWorkspace
      currentUserId={claims?.sub ?? null}
      isApprovalEnabled={isFeatureEnabled(claims, 'document-approval')}
    />
  );
}
