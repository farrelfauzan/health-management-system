import type { QueryClient } from '@tanstack/react-query';

const DOCUMENT_TYPE_QUERY_PREFIX = '/api/v1/document-types';

/** Every list variant — live-only and with deactivated rows — after any mutation. */
export async function invalidateDocumentTypeQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return typeof firstKey === 'string' && firstKey.startsWith(DOCUMENT_TYPE_QUERY_PREFIX);
    },
  });
}
