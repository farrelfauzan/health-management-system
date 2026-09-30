import { redirect } from 'next/navigation';

import { AnalyticsPharmacyPanel } from '#components/client/analytics/analytics-pharmacy-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type AdminAnalyticsPharmacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The Farmasi dashboard (P29-T13), replacing its T01 placeholder. Opens on
 * `analytics.read-pharmacy`, which ADMIN and PHARMACIST hold, and only
 * while the clinic has the pharmacy module.
 */
export default async function AdminAnalyticsPharmacyPage({
  searchParams,
}: AdminAnalyticsPharmacyPageProps) {
  const access = await resolveAnalyticsAccess();
  if (
    !access.isEnabled ||
    !access.hasFeature('pharmacy') ||
    !access.ability.can('read-pharmacy', 'Analytics')
  ) {
    redirect('/admin/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('admin');
  return <AnalyticsPharmacyPanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />;
}
