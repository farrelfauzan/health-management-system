import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LabOrderDetailPanel } from '#components/client/laboratory/lab-order-detail-panel';
import { hasAnyRole } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type AdminLabOrderPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * One order as the bench works it (`P18-T08`): tubes, values, the sheet, and
 * what has happened so far.
 *
 * The viewer's own account id comes down from the claims: the validation
 * screen explains a disabled Rilis button ("you typed these") before the API
 * refuses it, and the client has no other way to know who is looking.
 */
export default async function AdminLabOrderPage({ params }: AdminLabOrderPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'laboratory') || !ability.can('read', 'LabOrder')) {
    redirect('/admin/dashboard');
  }

  // Whether the viewer is *only* a technician decides one sentence: why the
  // Rilis button is off in a clinic that keeps release to doctors. The API
  // enforces it; the page merely knows the roles the panel cannot read.
  const isTechnicianOnly =
    hasAnyRole(claims, ['LAB_TECHNICIAN']) &&
    !hasAnyRole(claims, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR']);

  return (
    <LabOrderDetailPanel
      labOrderId={id}
      currentUserId={claims?.sub ?? null}
      isTechnicianOnly={isTechnicianOnly}
    />
  );
}
