import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SpecialtyPanel } from '#components/client/settings/specialty-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The poli catalog screen. Gated on `specialty.manage:any`, the same key the
 * settings card uses: reading the list needs no screen of its own, since every
 * form that picks a poli already shows it. Visibility only — the API refuses
 * the writes regardless.
 */
export default async function AdminSpecialtiesPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!ability.can('manage', 'Specialty')) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="space-y-6">
      <SpecialtyPanel />
    </div>
  );
}
