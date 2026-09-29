import { redirect } from 'next/navigation';

import { AnalyticsOperationsPanel } from '#components/client/analytics/analytics-operations-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type AdminAnalyticsOperationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The Operasional dashboard (P29-T05), replacing its T01 placeholder: a
 * static route wins over `/admin/analytics/[dashboard]`. The filter is read
 * from the URL here, against the clinic's today, and handed to the panel.
 */
export default async function AdminAnalyticsOperationsPage({
  searchParams,
}: AdminAnalyticsOperationsPageProps) {
  const access = await resolveAnalyticsAccess();
  if (!access.isEnabled || !access.ability.can('read-operations', 'Analytics')) {
    redirect('/admin/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('admin');
  return <AnalyticsOperationsPanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />;
}
