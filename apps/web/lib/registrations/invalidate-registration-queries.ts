import type { QueryClient } from '@tanstack/react-query';

const REGISTRATION_QUERY_PREFIXES = ['/api/v1/registrations'];

export async function invalidateRegistrationQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        REGISTRATION_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
