import type { QueryClient } from '@tanstack/react-query';

/**
 * Any structural write moves the whole chart, not one row: a move re-parents
 * every descendant, and an archive changes what the default tree contains. So
 * every organization query refreshes together rather than each dialog
 * invalidating the one key it happened to touch.
 */
const ORGANIZATION_QUERY_PREFIX = '/api/v1/organization-units';

export async function invalidateOrganizationQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return typeof firstKey === 'string' && firstKey.startsWith(ORGANIZATION_QUERY_PREFIX);
    },
  });
}
