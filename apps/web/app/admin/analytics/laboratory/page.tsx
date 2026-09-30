import { redirect } from 'next/navigation';

import { AnalyticsLaboratoryPanel } from '#components/client/analytics/analytics-laboratory-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type AdminAnalyticsLaboratoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The Laboratorium dashboard (P29-T14), replacing its T01 placeholder. Opens
 * on `analytics.read-lab`, which ADMIN and LAB_TECHNICIAN hold, and only
 * while the clinic has the laboratory module.
 */
export default async function AdminAnalyticsLaboratoryPage({
  searchParams,
}: AdminAnalyticsLaboratoryPageProps) {
  const access = await resolveAnalyticsAccess();
  if (
    !access.isEnabled ||
    !access.hasFeature('laboratory') ||
    !access.ability.can('read-lab', 'Analytics')
  ) {
    redirect('/admin/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('admin');
  return <AnalyticsLaboratoryPanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />;
}
