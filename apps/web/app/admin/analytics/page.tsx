import { redirect } from 'next/navigation';

import { ANALYTICS_DASHBOARDS } from '#lib/analytics/analytics-dashboards';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';

/**
 * `/admin/analytics` has no page of its own: it opens the first dashboard, in
 * sidebar order, that the viewer may read.
 */
export default async function AdminAnalyticsPage() {
  const access = await resolveAnalyticsAccess();
  const firstReadable = ANALYTICS_DASHBOARDS.find((dashboard) =>
    access.ability.can(dashboard.action, 'Analytics'),
  );
  redirect(access.isEnabled && firstReadable ? firstReadable.href : '/admin/dashboard');
}
