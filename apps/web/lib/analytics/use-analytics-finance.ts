import type { keepPreviousData } from '@tanstack/react-query';
import {
  analyticsFinanceControllerGetFinanceV1,
  getAnalyticsFinanceControllerGetFinanceV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import type { AnalyticsFinanceData, AnalyticsResponseMeta } from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsFinanceParams } from '#lib/analytics/to-analytics-finance-params';

const FIVE_MINUTES_MS = 5 * 60_000;

type AnalyticsFinanceQueryOptions = {
  placeholderData?: typeof keepPreviousData;
};

/**
 * The finance dashboard for a filter. Not retried and kept fresh as long as
 * the API's own cache, for the same reasons as the operations dashboard.
 */
export function useAnalyticsFinance(
  state: AnalyticsFilterState,
  isEnabled: boolean,
  options: AnalyticsFinanceQueryOptions = {},
) {
  const params = toAnalyticsFinanceParams(state);
  const query = useApiQuery<AnalyticsFinanceData>({
    queryKey: getAnalyticsFinanceControllerGetFinanceV1QueryKey(params),
    queryFn: (signal) => analyticsFinanceControllerGetFinanceV1(params, signal),
    errorMessage: 'Failed to load the finance dashboard',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS, ...options },
  });
  return {
    ...query,
    finance: query.data,
    financeMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
