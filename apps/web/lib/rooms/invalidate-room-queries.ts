import type { QueryClient } from '@tanstack/react-query';

/**
 * Any inventory write moves the occupancy board, and an admission moves it
 * too — a bed the board still calls free is the one mistake this screen exists
 * to prevent, so all four keys refresh together rather than each panel
 * refreshing its own.
 */
const ROOM_QUERY_PREFIXES = [
  '/api/v1/wards',
  '/api/v1/rooms',
  '/api/v1/beds',
  '/api/v1/room-occupancy',
];

export async function invalidateRoomQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        ROOM_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
