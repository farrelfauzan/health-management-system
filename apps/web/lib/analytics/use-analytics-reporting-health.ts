import type { AnalyticsReportingHealthData, AnalyticsResponseMeta } from '@hms/shared-types';

import {
  analyticsReportingHealthControllerGetReportingHealthV1,
  getAnalyticsReportingHealthControllerGetReportingHealthV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';

const FIVE_MINUTES_MS = 5 * 60_000;

/**
 * The reporting status for a period. Not retried, like the operations
 * dashboard: a query past the API's limit would only hit it again.
 */
export function useAnalyticsReportingHealth(
  { from, to }: AnalyticsPeriodRange,
  isEnabled: boolean,
) {
  const params = { from, to };
  const query = useApiQuery<AnalyticsReportingHealthData>({
    queryKey: getAnalyticsReportingHealthControllerGetReportingHealthV1QueryKey(params),
    queryFn: (signal) => analyticsReportingHealthControllerGetReportingHealthV1(params, signal),
    errorMessage: 'Failed to load the reporting status',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS },
  });
  return {
    ...query,
    reportingHealth: query.data,
    reportingHealthMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
