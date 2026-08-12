import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildAppAbility } from '@hms/ui';

import { ClinicCorpusPanel } from '#components/client/clinic-documents/clinic-corpus-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/**
 * The shared clinic FAQ/SOP corpus (`PCS-T03`) — the documents the assistant
 * and, from `PCS-T05`, the public WhatsApp/Telegram channel answer from. An
 * administrator's *own* knowledge base is a different screen at
 * `/admin/knowledge-base`.
 *
 * The ability check here is visibility only, and cannot be more than that:
 * `resolveAppAbilityRules` drops the `:own` / `:any` suffix by design, so it
 * cannot tell an admin's clinic-corpus grant from a clinician's personal one.
 * Two other things make that safe. `proxy.ts` admits only `ADMIN` and
 * `SUPER_ADMIN` under `/admin`, and the API's `DocumentService` re-checks the
 * `ANY` scope on every one of these routes — because `PermissionsGuard`
 * cannot distinguish the two grants either, and the integration suite asserts
 * a `403` for a doctor on all six.
 */
export default async function AdminClinicCorpusPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));
  if (!ability.can('read', 'Document')) {
    redirect('/admin/dashboard');
  }
  return <ClinicCorpusPanel />;
}
