import { redirect } from 'next/navigation';

import { AnalyticsPracticePanel } from '#components/client/analytics/analytics-practice-panel';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';
import { resolveClinicToday } from '#lib/shared/clinic-today';

type DoctorAnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * "Praktik saya" (P29-T15): a doctor's or midwife's own practice, on
 * `analytics.read-practice:own`. Only the period comes from the URL; the
 * clinician is always the one signed in.
 */
export default async function DoctorAnalyticsPage({ searchParams }: DoctorAnalyticsPageProps) {
  const access = await resolveAnalyticsAccess();
  if (!access.isEnabled || !access.ability.can('read-practice', 'Analytics')) {
    redirect('/doctor/dashboard');
  }
  const today = resolveClinicToday();
  const filter = parseAnalyticsFilterParams(await searchParams, today);
  const breadcrumbRoot = await resolveShellBreadcrumbRoot('doctor');
  return <AnalyticsPracticePanel filter={filter} today={today} breadcrumbRoot={breadcrumbRoot} />;
}
