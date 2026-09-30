import type { keepPreviousData } from '@tanstack/react-query';
import {
  analyticsPharmacyControllerGetPharmacyV1,
  getAnalyticsPharmacyControllerGetPharmacyV1QueryKey,
} from '#lib/api/generated/analytics/analytics';
import type { AnalyticsPharmacyData, AnalyticsResponseMeta } from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsPharmacyParams } from '#lib/analytics/to-analytics-pharmacy-params';

const FIVE_MINUTES_MS = 5 * 60_000;

type AnalyticsPharmacyQueryOptions = {
  placeholderData?: typeof keepPreviousData;
};

/** The pharmacy dashboard for a filter; not retried, fresh as long as the API's cache. */
export function useAnalyticsPharmacy(
  state: AnalyticsFilterState,
  isEnabled: boolean,
  options: AnalyticsPharmacyQueryOptions = {},
) {
  const params = toAnalyticsPharmacyParams(state);
  const query = useApiQuery<AnalyticsPharmacyData>({
    queryKey: getAnalyticsPharmacyControllerGetPharmacyV1QueryKey(params),
    queryFn: (signal) => analyticsPharmacyControllerGetPharmacyV1(params, signal),
    errorMessage: 'Failed to load the pharmacy dashboard',
    enabled: isEnabled,
    options: { retry: false, staleTime: FIVE_MINUTES_MS, ...options },
  });
  return {
    ...query,
    pharmacy: query.data,
    pharmacyMeta: query.meta as AnalyticsResponseMeta | undefined,
    errorCode: resolveApiErrorCode(query.error),
  };
}
