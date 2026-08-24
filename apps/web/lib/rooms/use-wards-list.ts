import type { RoomInventoryListMeta, WardResponse } from '@hms/shared-types';

import type { WardControllerListWardsV1Params } from '#lib/api/generated/model/wardControllerListWardsV1Params';
import {
  getWardControllerListWardsV1QueryKey,
  wardControllerListWardsV1,
} from '#lib/api/generated/room-management/room-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useWardsList(params: WardControllerListWardsV1Params, isEnabled = true) {
  const query = useApiQuery<WardResponse[]>({
    queryKey: getWardControllerListWardsV1QueryKey(params),
    queryFn: (signal) => wardControllerListWardsV1(params, signal),
    errorMessage: 'Failed to load wards',
    enabled: isEnabled,
  });

  return {
    ...query,
    wards: query.data ?? [],
    meta: query.meta as RoomInventoryListMeta | undefined,
  };
}
