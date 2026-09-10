import type { Region } from '@hms/shared-types';

import {
  getRegionsControllerListProvincesV1QueryKey,
  regionsControllerListProvincesV1,
} from '#lib/api/generated/regions/regions';
import { useApiQuery } from '#lib/api/use-api-query';
import { REGION_STALE_TIME_MS } from '#lib/regions/region-stale-time';

/**
 * The 38 provinces, the top of the address cascade (P19-T10). Unfiltered and
 * unpaged: the whole level fits in one response and one combobox.
 */
export function useProvinces(enabled: boolean) {
  const query = useApiQuery<Region[]>({
    queryKey: getRegionsControllerListProvincesV1QueryKey(),
    queryFn: (signal) => regionsControllerListProvincesV1(signal),
    errorMessage: 'Failed to load provinces',
    enabled,
    options: { staleTime: REGION_STALE_TIME_MS },
  });

  return { ...query, regions: query.data ?? [] };
}
