import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ManagedDocumentWorkspace } from '#components/client/managed-documents/managed-document-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type AdminDocumentWorkspacePageProps = {
  params: Promise<{ id: string }>;
};

/**
 * One document's workspace (`P16-T31`, §7.5.1).
 *
 * Gated on the registry read alone, like the registry itself: the API decides
 * whether *this* row is one the caller may open, and answers 404 rather than
 * 403 when it is not (FR-E5-04). The viewer's own id comes from the session
 * claims here rather than from a client fetch, because the workspace needs it
 * before its first render to decide whether the approve controls belong to
 * this person.
 */
export default async function AdminDocumentWorkspacePage({
  params,
}: AdminDocumentWorkspacePageProps) {
  const { id } = await params;
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
    <ManagedDocumentWorkspace
      documentId={id}
      currentUserId={claims?.sub ?? null}
      isApprovalEnabled={isFeatureEnabled(claims, 'document-approval')}
    />
  );
}
