import type { Region } from '@hms/shared-types';

import {
  getRegionsControllerListRegenciesV1QueryKey,
  regionsControllerListRegenciesV1,
} from '#lib/api/generated/regions/regions';
import { useApiQuery } from '#lib/api/use-api-query';
import { REGION_STALE_TIME_MS } from '#lib/regions/region-stale-time';

type UseRegenciesParams = {
  provinceCode: string;
  enabled: boolean;
};

/**
 * The regencies and cities of one province. Disabled until a province is
 * chosen, so an empty parent never sends a request the API would refuse.
 */
export function useRegencies({ provinceCode, enabled }: UseRegenciesParams) {
  const requestParams = { provinceCode };
  const query = useApiQuery<Region[]>({
    queryKey: getRegionsControllerListRegenciesV1QueryKey(requestParams),
    queryFn: (signal) => regionsControllerListRegenciesV1(requestParams, signal),
    errorMessage: 'Failed to load regencies',
    enabled: enabled && provinceCode !== '',
    options: { staleTime: REGION_STALE_TIME_MS },
  });

  return { ...query, regions: query.data ?? [] };
}
