import type { Region, RegionsListMeta } from '@hms/shared-types';

import {
  getRegionsControllerListVillagesV1QueryKey,
  regionsControllerListVillagesV1,
} from '#lib/api/generated/regions/regions';
import { useApiQuery } from '#lib/api/use-api-query';
import { useDebouncedValue } from '#hooks/use-debounced-value';
import { REGION_STALE_TIME_MS } from '#lib/regions/region-stale-time';

/**
 * One page is all a combobox shows. A district holds a few hundred villages at
 * most, so the first fifty plus a server-side prefix search reach any of them
 * in a couple of keystrokes without shipping the level in full.
 */
const VILLAGE_PAGE_LIMIT = 50;

/** Long enough that typing a name does not fire a request per keystroke. */
const VILLAGE_SEARCH_DEBOUNCE_MS = 250;

type UseVillagesParams = {
  districtCode: string;
  search: string;
  enabled: boolean;
};

/**
 * The kelurahan and desa of one district, searched on the server.
 *
 * Search is debounced here rather than in the combobox so the input stays
 * responsive while the request lags behind it, and a blank term is sent as no
 * term at all rather than as an empty `q` the API would reject.
 */
export function useVillages({ districtCode, search, enabled }: UseVillagesParams) {
  const debouncedSearch = useDebouncedValue(search.trim(), VILLAGE_SEARCH_DEBOUNCE_MS);
  const requestParams = {
    districtCode,
    page: 1,
    limit: VILLAGE_PAGE_LIMIT,
    ...(debouncedSearch === '' ? {} : { q: debouncedSearch }),
  };
  const query = useApiQuery<Region[]>({
    queryKey: getRegionsControllerListVillagesV1QueryKey(requestParams),
    queryFn: (signal) => regionsControllerListVillagesV1(requestParams, signal),
    errorMessage: 'Failed to load villages',
    enabled: enabled && districtCode !== '',
    options: { staleTime: REGION_STALE_TIME_MS },
  });
  const meta = query.meta as RegionsListMeta | undefined;
  const regions = query.data ?? [];

  return {
    ...query,
    regions,
    /**
     * Whether the district holds more villages than this page shows, so the
     * combobox can say "keep typing" instead of implying the list is complete.
     */
    hasMore: (meta?.total ?? regions.length) > regions.length,
  };
}
