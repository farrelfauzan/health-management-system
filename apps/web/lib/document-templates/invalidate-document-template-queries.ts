import type { QueryClient } from '@tanstack/react-query';

const DOCUMENT_TEMPLATE_QUERY_PREFIX = '/api/v1/document-templates';

export async function invalidateDocumentTemplateQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return typeof firstKey === 'string' && firstKey.startsWith(DOCUMENT_TEMPLATE_QUERY_PREFIX);
    },
  });
}
