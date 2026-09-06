import type { QueryClient } from '@tanstack/react-query';

import { invalidateManagedDocumentQueries } from '#lib/managed-documents/invalidate-managed-document-queries';

const APPROVAL_QUERY_PREFIX = '/api/v1/document-approvals';

/**
 * Everything a decision changes: the queue, the badge, and the registry
 * behind them.
 *
 * The badge and the list are refetched together on purpose — a decision made
 * in one tab and a count rendered in another are exactly how "3 waiting" ends
 * up sitting above an empty list (§7.5.10).
 */
export async function invalidateDocumentApprovalQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return typeof firstKey === 'string' && firstKey.startsWith(APPROVAL_QUERY_PREFIX);
    },
  });
  await invalidateManagedDocumentQueries(queryClient);
}
