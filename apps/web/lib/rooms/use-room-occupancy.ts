import type { WardOccupancyResponse } from '@hms/shared-types';

import type { RoomOccupancyControllerGetOccupancyV1Params } from '#lib/api/generated/model/roomOccupancyControllerGetOccupancyV1Params';
import {
  getRoomOccupancyControllerGetOccupancyV1QueryKey,
  roomOccupancyControllerGetOccupancyV1,
} from '#lib/api/generated/room-management/room-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useRoomOccupancy(
  params: RoomOccupancyControllerGetOccupancyV1Params,
  isEnabled = true,
) {
  const query = useApiQuery<WardOccupancyResponse[]>({
    queryKey: getRoomOccupancyControllerGetOccupancyV1QueryKey(params),
    queryFn: (signal) => roomOccupancyControllerGetOccupancyV1(params, signal),
    errorMessage: 'Failed to load the occupancy board',
    enabled: isEnabled,
  });

  return {
    ...query,
    wards: query.data ?? [],
  };
}
