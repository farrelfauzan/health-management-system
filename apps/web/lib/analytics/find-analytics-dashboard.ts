import {
  ANALYTICS_DASHBOARDS,
  type AnalyticsDashboard,
} from '#lib/analytics/analytics-dashboards';

/** The dashboard for a route segment, or `undefined` for an unknown one. */
export function findAnalyticsDashboard(slug: string): AnalyticsDashboard | undefined {
  return ANALYTICS_DASHBOARDS.find((dashboard) => dashboard.slug === slug);
}
