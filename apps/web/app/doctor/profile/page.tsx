import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { OwnDoctorProfilePanel } from '#components/client/doctor-profile/own-doctor-profile-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The signed-in doctor's own profile (P20-T03).
 *
 * Visibility only: the ability cannot see the scope (`permissionToRule` drops
 * `:own` / `:any`), and whose profile comes back — and which fields may change
 * — is the API's decision through `me/doctor-profile`. `proxy.ts` already keeps
 * everyone but doctors out of `/doctor`, so a pharmacist never reaches this.
 */
export default async function DoctorProfilePage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('update', 'Doctor')) {
    redirect('/doctor/dashboard');
  }
  return <OwnDoctorProfilePanel />;
}
