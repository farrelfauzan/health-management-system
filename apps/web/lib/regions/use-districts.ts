import type { Region } from '@hms/shared-types';

import {
  getRegionsControllerListDistrictsV1QueryKey,
  regionsControllerListDistrictsV1,
} from '#lib/api/generated/regions/regions';
import { useApiQuery } from '#lib/api/use-api-query';
import { REGION_STALE_TIME_MS } from '#lib/regions/region-stale-time';

type UseDistrictsParams = {
  regencyCode: string;
  enabled: boolean;
};

/**
 * The kecamatan of one regency or city. Disabled until a regency is chosen.
 */
export function useDistricts({ regencyCode, enabled }: UseDistrictsParams) {
  const requestParams = { regencyCode };
  const query = useApiQuery<Region[]>({
    queryKey: getRegionsControllerListDistrictsV1QueryKey(requestParams),
    queryFn: (signal) => regionsControllerListDistrictsV1(requestParams, signal),
    errorMessage: 'Failed to load districts',
    enabled: enabled && regencyCode !== '',
    options: { staleTime: REGION_STALE_TIME_MS },
  });

  return { ...query, regions: query.data ?? [] };
}
