import type { QueryClient } from '@tanstack/react-query';

/**
 * Both prefixes, always: linking an encounter changes the episode's visit
 * list, and editing the episode changes what the encounter card reads.
 */
const MATERNAL_CARE_QUERY_PREFIXES = [
  '/api/v1/patients',
  '/api/v1/pregnancy-episodes',
  '/api/v1/encounters',
];

export async function invalidateMaternalCareQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        MATERNAL_CARE_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
