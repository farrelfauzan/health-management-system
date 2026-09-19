import type { QueryClient } from '@tanstack/react-query';

const TAX_PATH_PREFIXES = [
  '/api/v1/tax/codes',
  '/api/v1/tax/category-defaults',
  '/api/v1/tax/assignments',
];

/**
 * Every tax-code read at once: a new code, a moved default or a bulk apply
 * changes what the codes table, the defaults and the assignment list all show.
 */
export async function invalidateTaxCodeQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [path] = query.queryKey;
      return (
        typeof path === 'string' && TAX_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
      );
    },
  });
}
