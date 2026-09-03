import type { QueryClient } from '@tanstack/react-query';

import { getVaultDocumentControllerListDocumentsV1QueryKey } from '#lib/api/generated/document-management/document-management';

/**
 * Refetches the vault list after any mutation. The whole list is invalidated
 * rather than a row patched in place: an upload and a hard delete both change
 * the set, and a rename changes fields the server normalises.
 */
export async function invalidateVaultDocumentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getVaultDocumentControllerListDocumentsV1QueryKey(),
  });
}
