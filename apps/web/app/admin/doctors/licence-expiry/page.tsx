import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { LicenseExpiryPanel } from '#components/client/doctors/license-expiry-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The clinic's licence expiry roster (P16-T19).
 *
 * Its own route under `/admin/doctors` rather than a tab on the directory,
 * because the directory answers to `Doctor` read — held by doctors and
 * patients — while this answers to `DoctorLicenseExpiry` read, which is
 * administrators alone. The redirect is visibility only; the API's
 * `PermissionsGuard` is what actually refuses the data.
 */
export default async function AdminLicenceExpiryPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('read', 'DoctorLicenseExpiry')) {
    redirect('/admin/dashboard');
  }
  return <LicenseExpiryPanel />;
}
