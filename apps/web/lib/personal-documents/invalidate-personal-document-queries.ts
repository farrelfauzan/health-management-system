import type { QueryClient } from '@tanstack/react-query';

import { getPersonalDocumentControllerListDocumentsV1QueryKey } from '#lib/api/generated/document-management/document-management';

/**
 * Refetches the list after any mutation. The whole list is invalidated rather
 * than a row patched in place: an upload changes the set, a delete changes it,
 * and a re-ingest changes a status the server owns — patching from a mutation
 * response would let the screen claim an ingest state the worker has not
 * reached yet.
 */
export async function invalidatePersonalDocumentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getPersonalDocumentControllerListDocumentsV1QueryKey(),
  });
}
