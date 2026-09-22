import type { QueryClient } from '@tanstack/react-query';

const NON_CAPITATION_QUERY_PREFIX = '/api/v1/bpjs/non-capitation';

/**
 * Settings, tariffs and marks all change what the recap shows (the filing
 * date, the prices, the statuses), so every write re-reads every
 * non-capitation query, for every month.
 */
export async function invalidateNonCapitationQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return typeof firstKey === 'string' && firstKey.startsWith(NON_CAPITATION_QUERY_PREFIX);
    },
  });
}
