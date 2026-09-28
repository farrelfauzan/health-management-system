import { redirect } from 'next/navigation';

import { AnalyticsReportingHealthPanel } from '#components/client/analytics/analytics-reporting-health-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type AdminAnalyticsReportingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The Status pelaporan page (P29-T06), replacing its T01 placeholder. Read
 * with the operations key, like the endpoint behind it.
 */
export default async function AdminAnalyticsReportingPage({
  searchParams,
}: AdminAnalyticsReportingPageProps) {
  const access = await resolveAnalyticsAccess();
  if (!access.isEnabled || !access.ability.can('read-operations', 'Analytics')) {
    redirect('/admin/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('admin');
  return (
    <AnalyticsReportingHealthPanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />
  );
}
