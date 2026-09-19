import { buildAppAbility } from '@hms/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { TaxReportDetail } from '#components/client/taxes/tax-report-detail';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type AdminTaxReportPageProps = {
  params: Promise<{ reportId: string }>;
};

/** One monthly tax report (`P27-T05`), behind the same gates as the year grid. */
export default async function AdminTaxReportPage({ params }: AdminTaxReportPageProps) {
  const { reportId } = await params;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });
  const ability = buildAppAbility(resolveAppAbilityRules(claims));

  if (!isFeatureEnabled(claims, 'taxes') || !ability.can('read', 'TaxReport')) {
    redirect('/admin/dashboard');
  }

  return <TaxReportDetail reportId={reportId} />;
}
