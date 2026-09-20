import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { TaxReportsPanel } from '#components/client/taxes/tax-reports-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

const PERIOD_LENGTH = 7;

/**
 * The monthly tax report drafts (`P27-T05`). Gated like the tax settings page:
 * no page without the `taxes` entitlement or `tax-report.read:any`. The
 * current month comes from the server's clinic day, not the viewer's clock.
 */
export default async function AdminTaxesPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'taxes') || !ability.can('read', 'TaxReport')) {
    redirect('/admin/dashboard');
  }

  return <TaxReportsPanel currentPeriod={resolveClinicToday().slice(0, PERIOD_LENGTH)} />;
}
