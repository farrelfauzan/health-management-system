import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { TaxReportsPanel } from '#components/client/taxes/tax-reports-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';
import { TAX_REPORTS_VIEWS } from '#lib/taxes/tax-reports-views';

const PERIOD_LENGTH = 7;

type AdminTaxesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The monthly tax report drafts (`P27-T05`). Gated like the tax settings page:
 * no page without the `taxes` entitlement or `tax-report.read:any`. The
 * current month comes from the server's clinic day, not the viewer's clock.
 * `?view=` picks the tables (default) or the month cards.
 */
export default async function AdminTaxesPage({ searchParams }: AdminTaxesPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'taxes') || !ability.can('read', 'TaxReport')) {
    redirect('/admin/dashboard');
  }

  return (
    <TaxReportsPanel
      currentPeriod={resolveClinicToday().slice(0, PERIOD_LENGTH)}
      initialView={parseTabSearchParam(params.view, TAX_REPORTS_VIEWS)}
    />
  );
}
