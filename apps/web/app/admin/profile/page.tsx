import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { OwnAccountPanel } from '#components/client/account/own-account-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The signed-in operator's own account in the admin shell (P24-T15, D-039):
 * who the account is, and the NIK the front desk presents to SATUSEHAT's KYC.
 *
 * Visibility only: the ability cannot see the scope (`permissionToRule` drops
 * `:own` / `:any`), and whose account comes back is the API's decision through
 * `me/account`. Clinicians keep their own page under `/doctor/profile`; their
 * Practitioner NIK lives there and is the one KYC reads first.
 */
export default async function AdminProfilePage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('update', 'User')) {
    redirect('/admin/dashboard');
  }
  return <OwnAccountPanel />;
}
