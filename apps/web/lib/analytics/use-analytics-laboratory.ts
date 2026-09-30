import type { keepPreviousData } from '@tanstack/react-query';
import {
  analyticsLaboratoryControllerGetLaboratoryV1,
  getAnalyticsLaboratoryControllerGetLaboratoryV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import type { AnalyticsLaboratoryData, AnalyticsResponseMeta } from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsLaboratoryParams } from '#lib/analytics/to-analytics-laboratory-params';

const FIVE_MINUTES_MS = 5 * 60_000;

type AnalyticsLaboratoryQueryOptions = {
  placeholderData?: typeof keepPreviousData;
};

/** The laboratory dashboard for a filter; not retried, fresh as long as the API's cache. */
export function useAnalyticsLaboratory(
  state: AnalyticsFilterState,
  isEnabled: boolean,
  options: AnalyticsLaboratoryQueryOptions = {},
) {
  const params = toAnalyticsLaboratoryParams(state);
  const query = useApiQuery<AnalyticsLaboratoryData>({
    queryKey: getAnalyticsLaboratoryControllerGetLaboratoryV1QueryKey(params),
    queryFn: (signal) => analyticsLaboratoryControllerGetLaboratoryV1(params, signal),
    errorMessage: 'Failed to load the laboratory dashboard',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS, ...options },
  });
  return {
    ...query,
    laboratory: query.data,
    laboratoryMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
