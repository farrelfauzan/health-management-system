import type { QueryClient } from '@tanstack/react-query';

/**
 * Every laboratory read, in one sweep: collecting moves an order between
 * worklist tabs, saving a value changes the bench view, releasing queues a
 * report. Prefix-matched on the URL the query key starts with, the way the
 * encounter helper does, so a new lab route is covered without editing this.
 */
const LAB_QUERY_PREFIXES = ['/api/v1/lab-', '/api/v1/patients/', '/api/v1/laboratory/'];

export async function invalidateLabQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' && LAB_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
