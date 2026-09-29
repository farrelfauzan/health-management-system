import type { keepPreviousData } from '@tanstack/react-query';
import {
  analyticsOperationsControllerGetOperationsV1,
  getAnalyticsOperationsControllerGetOperationsV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import type { AnalyticsOperationsData, AnalyticsResponseMeta } from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsOperationsParams } from '#lib/analytics/to-analytics-operations-params';

const FIVE_MINUTES_MS = 5 * 60_000;

/**
 * `keepPreviousData` keeps the last view on screen while a new filter loads,
 * so the dashboard does not blank out between presets.
 */
type AnalyticsOperationsQueryOptions = {
  placeholderData?: typeof keepPreviousData;
};

/**
 * The operations dashboard for a filter. Not retried: a query that ran into
 * the API's ten-second limit would only run into it again, and the screen
 * owes the reader the "too slow" state now, not in twenty seconds. Kept
 * fresh as long as the API's own cache, so switching back to a filter shows
 * it at once.
 */
export function useAnalyticsOperations(
  state: AnalyticsFilterState,
  isEnabled: boolean,
  options: AnalyticsOperationsQueryOptions = {},
) {
  const params = toAnalyticsOperationsParams(state);
  const query = useApiQuery<AnalyticsOperationsData>({
    queryKey: getAnalyticsOperationsControllerGetOperationsV1QueryKey(params),
    queryFn: (signal) => analyticsOperationsControllerGetOperationsV1(params, signal),
    errorMessage: 'Failed to load the operations dashboard',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS, ...options },
  });
  return {
    ...query,
    operations: query.data,
    operationsMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
