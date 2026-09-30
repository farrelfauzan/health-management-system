import { redirect } from 'next/navigation';

import { AnalyticsFinancePanel } from '#components/client/analytics/analytics-finance-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type AdminAnalyticsFinancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The Keuangan dashboard (P29-T09), replacing its T01 placeholder: a static
 * route wins over `/admin/analytics/[dashboard]`. Opens on
 * `analytics.read-finance`, which a role can hold without the others.
 */
export default async function AdminAnalyticsFinancePage({
  searchParams,
}: AdminAnalyticsFinancePageProps) {
  const access = await resolveAnalyticsAccess();
  if (!access.isEnabled || !access.ability.can('read-finance', 'Analytics')) {
    redirect('/admin/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('admin');
  return <AnalyticsFinancePanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />;
}
