import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { DoctorCredentialPanel } from '#components/client/settings/doctor-credential-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The doctor credential catalog screen (P19-T14).
 *
 * Gated on `read` for Doctor rather than the write key the hub card uses:
 * anyone who may look at a doctor may look at the lists doctors are described
 * by, and the panel itself hides the add and deactivate controls from whoever
 * cannot change them. Visibility only — `PermissionsGuard` refuses the write
 * endpoints regardless.
 */
export default async function AdminDoctorCredentialsPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!ability.can('read', 'Doctor')) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="space-y-6">
      <DoctorCredentialPanel />
    </div>
  );
}
