import type { QueryClient } from '@tanstack/react-query';

const PHARMACY_QUERY_PREFIXES = [
  '/api/v1/prescriptions',
  '/api/v1/medications',
  '/api/v1/dispenses',
  '/api/v1/inventory',
];

export async function invalidatePharmacyQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        PHARMACY_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
