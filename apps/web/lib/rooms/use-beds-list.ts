import type { BedResponse, RoomInventoryListMeta } from '@hms/shared-types';

import type { BedControllerListBedsV1Params } from '#lib/api/generated/model/bedControllerListBedsV1Params';
import {
  bedControllerListBedsV1,
  getBedControllerListBedsV1QueryKey,
} from '#lib/api/generated/room-management/room-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useBedsList(params: BedControllerListBedsV1Params, isEnabled = true) {
  const query = useApiQuery<BedResponse[]>({
    queryKey: getBedControllerListBedsV1QueryKey(params),
    queryFn: (signal) => bedControllerListBedsV1(params, signal),
    errorMessage: 'Failed to load beds',
    enabled: isEnabled,
  });

  return {
    ...query,
    beds: query.data ?? [],
    meta: query.meta as RoomInventoryListMeta | undefined,
  };
}
