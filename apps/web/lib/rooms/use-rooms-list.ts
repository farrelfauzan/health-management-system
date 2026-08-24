import type { RoomInventoryListMeta, RoomResponse } from '@hms/shared-types';

import type { RoomControllerListRoomsV1Params } from '#lib/api/generated/model/roomControllerListRoomsV1Params';
import {
  getRoomControllerListRoomsV1QueryKey,
  roomControllerListRoomsV1,
} from '#lib/api/generated/room-management/room-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useRoomsList(params: RoomControllerListRoomsV1Params, isEnabled = true) {
  const query = useApiQuery<RoomResponse[]>({
    queryKey: getRoomControllerListRoomsV1QueryKey(params),
    queryFn: (signal) => roomControllerListRoomsV1(params, signal),
    errorMessage: 'Failed to load rooms',
    enabled: isEnabled,
  });

  return {
    ...query,
    rooms: query.data ?? [],
    meta: query.meta as RoomInventoryListMeta | undefined,
  };
}
