import type { keepPreviousData } from '@tanstack/react-query';
import {
  analyticsCaseMixControllerGetCaseMixV1,
  getAnalyticsCaseMixControllerGetCaseMixV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import type { AnalyticsCaseMixData, AnalyticsResponseMeta } from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsCaseMixParams } from '#lib/analytics/to-analytics-case-mix-params';

const FIVE_MINUTES_MS = 5 * 60_000;

type AnalyticsCaseMixQueryOptions = {
  placeholderData?: typeof keepPreviousData;
};

/** The case-mix dashboard for a filter; not retried, fresh as long as the API's cache. */
export function useAnalyticsCaseMix(
  state: AnalyticsFilterState,
  isEnabled: boolean,
  options: AnalyticsCaseMixQueryOptions = {},
) {
  const params = toAnalyticsCaseMixParams(state);
  const query = useApiQuery<AnalyticsCaseMixData>({
    queryKey: getAnalyticsCaseMixControllerGetCaseMixV1QueryKey(params),
    queryFn: (signal) => analyticsCaseMixControllerGetCaseMixV1(params, signal),
    errorMessage: 'Failed to load the case-mix dashboard',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS, ...options },
  });
  return {
    ...query,
    caseMix: query.data,
    caseMixMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
