import type { QueryClient } from '@tanstack/react-query';

import {
  getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey,
  getVaultDocumentShareControllerListSharesV1QueryKey,
} from '#lib/api/generated/document-management/document-management';

/**
 * Refetches the owner's sharing panel after a grant or a revoke.
 *
 * The recipient's *Shared with me* list is invalidated too, even though it
 * belongs to a different person: the same account can be both, and an admin
 * who shares a document with a colleague and holds one of their own would
 * otherwise see a stale list until something else refetched it.
 */
export async function invalidateShareQueries(
  queryClient: QueryClient,
  documentId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: getVaultDocumentShareControllerListSharesV1QueryKey(documentId),
    }),
    queryClient.invalidateQueries({
      queryKey: getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey(),
    }),
  ]);
}
