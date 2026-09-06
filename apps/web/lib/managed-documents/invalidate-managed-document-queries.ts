import type { QueryClient } from '@tanstack/react-query';

const MANAGED_DOCUMENT_QUERY_PREFIX = '/api/v1/documents';

const DOCUMENT_TYPE_QUERY_PREFIX = '/api/v1/document-types';

/**
 * Every registry list after a mutation — and the type list with it, because
 * a new document changes a type's usage count on the settings screen.
 */
export async function invalidateManagedDocumentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        (firstKey.startsWith(MANAGED_DOCUMENT_QUERY_PREFIX) ||
          firstKey.startsWith(DOCUMENT_TYPE_QUERY_PREFIX))
      );
    },
  });
}
