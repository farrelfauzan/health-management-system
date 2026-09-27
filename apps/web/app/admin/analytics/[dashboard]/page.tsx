import { redirect } from 'next/navigation';

import { AnalyticsPlaceholder } from '#components/server/analytics/analytics-placeholder';
import { findAnalyticsDashboard } from '#lib/analytics/find-analytics-dashboard';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';

type AdminAnalyticsDashboardPageProps = {
  params: Promise<{ dashboard: string }>;
};

/**
 * One analytics dashboard (P29-T01). No page without the `analytics`
 * entitlement or the dashboard's own read key. Each dashboard ticket replaces
 * its placeholder with a static route of its own, which Next.js prefers over
 * this dynamic one.
 */
export default async function AdminAnalyticsDashboardPage({
  params,
}: AdminAnalyticsDashboardPageProps) {
  const { dashboard: slug } = await params;
  const dashboard = findAnalyticsDashboard(slug);
  const access = await resolveAnalyticsAccess();
  if (!dashboard || !access.isEnabled || !access.ability.can(dashboard.action, 'Analytics')) {
    redirect('/admin/dashboard');
  }
  return <AnalyticsPlaceholder dashboard={dashboard} />;
}
