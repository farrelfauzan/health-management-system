import type { QueryClient } from '@tanstack/react-query';

/**
 * Closing or cancelling an encounter also settles its registration, so the
 * registration queue is refetched alongside the encounter itself — a stale
 * CHECKED_IN row would otherwise still offer to open a second encounter.
 */
const ENCOUNTER_QUERY_PREFIXES = ['/api/v1/encounters', '/api/v1/registrations'];

export async function invalidateEncounterQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        ENCOUNTER_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
