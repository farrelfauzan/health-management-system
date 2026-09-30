import { redirect } from 'next/navigation';

import { AnalyticsCaseMixPanel } from '#components/client/analytics/analytics-case-mix-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type AdminAnalyticsCaseMixPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The Pola penyakit dashboard (P29-T12), replacing its T01 placeholder.
 * Opens on `analytics.read-clinical`, which SUPER_ADMIN is not given
 * (D-033); the PO allowed ADMIN on 2026-09-30 (Q-1), as statistics only.
 */
export default async function AdminAnalyticsCaseMixPage({
  searchParams,
}: AdminAnalyticsCaseMixPageProps) {
  const access = await resolveAnalyticsAccess();
  if (!access.isEnabled || !access.ability.can('read-clinical', 'Analytics')) {
    redirect('/admin/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('admin');
  return <AnalyticsCaseMixPanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />;
}
