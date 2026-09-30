import type { AnalyticsVisitsToday } from '@hms/shared-types';

import {
  analyticsOperationsControllerGetVisitsTodayV1,
  getAnalyticsOperationsControllerGetVisitsTodayV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import { useApiQuery } from '#lib/api/use-api-query';
import { DASHBOARD_REFRESH_INTERVAL_MS } from '#lib/dashboard/dashboard-refresh';

/**
 * Visits so far today against the same weekday last week (P29-T16),
 * refetched on the dashboard's own refresh clock since it is a running count.
 */
export function useVisitsToday() {
  return useApiQuery<AnalyticsVisitsToday>({
    queryKey: getAnalyticsOperationsControllerGetVisitsTodayV1QueryKey(),
    queryFn: (signal) => analyticsOperationsControllerGetVisitsTodayV1(signal),
    errorMessage: "Failed to load today's visits",
    options: { retry: false, refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS },
  });
}
