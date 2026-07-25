import type { QueryClient } from '@tanstack/react-query';

const ADMIN_USER_QUERY_PREFIX = '/api/v1/users';

export async function invalidateAdminUserQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return typeof firstKey === 'string' && firstKey.startsWith(ADMIN_USER_QUERY_PREFIX);
    },
  });
}
