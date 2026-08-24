import type { RoomClassResponse, RoomInventoryListMeta } from '@hms/shared-types';

import type { RoomClassControllerListRoomClassesV1Params } from '#lib/api/generated/model/roomClassControllerListRoomClassesV1Params';
import {
  getRoomClassControllerListRoomClassesV1QueryKey,
  roomClassControllerListRoomClassesV1,
} from '#lib/api/generated/room-management/room-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useRoomClassesList(
  params: RoomClassControllerListRoomClassesV1Params,
  isEnabled = true,
) {
  const query = useApiQuery<RoomClassResponse[]>({
    queryKey: getRoomClassControllerListRoomClassesV1QueryKey(params),
    queryFn: (signal) => roomClassControllerListRoomClassesV1(params, signal),
    errorMessage: 'Failed to load room classes',
    enabled: isEnabled,
  });

  return {
    ...query,
    roomClasses: query.data ?? [],
    meta: query.meta as RoomInventoryListMeta | undefined,
  };
}
