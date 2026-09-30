import type { keepPreviousData } from '@tanstack/react-query';
import {
  analyticsPracticeControllerGetMyPracticeV1,
  getAnalyticsPracticeControllerGetMyPracticeV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import type { AnalyticsPracticeData, AnalyticsResponseMeta } from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsPracticeParams } from '#lib/analytics/to-analytics-practice-params';

const FIVE_MINUTES_MS = 5 * 60_000;

type AnalyticsPracticeQueryOptions = {
  placeholderData?: typeof keepPreviousData;
};

/** The signed-in clinician's own practice for a period; not retried, fresh as long as the API's cache. */
export function useAnalyticsPractice(
  state: AnalyticsFilterState,
  isEnabled: boolean,
  options: AnalyticsPracticeQueryOptions = {},
) {
  const params = toAnalyticsPracticeParams(state);
  const query = useApiQuery<AnalyticsPracticeData>({
    queryKey: getAnalyticsPracticeControllerGetMyPracticeV1QueryKey(params),
    queryFn: (signal) => analyticsPracticeControllerGetMyPracticeV1(params, signal),
    errorMessage: 'Failed to load the practice dashboard',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS, ...options },
  });
  return {
    ...query,
    practice: query.data,
    practiceMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
