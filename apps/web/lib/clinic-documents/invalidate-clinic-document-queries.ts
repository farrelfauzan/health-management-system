import type { QueryClient } from '@tanstack/react-query';

import { getDocumentAdminControllerListDocumentsV1QueryKey } from '#lib/api/generated/document-management/document-management';

/**
 * Refetches the corpus after any mutation.
 *
 * Invalidated by the list key's **prefix**, without the filter params: the
 * screen holds one filtered view at a time, but every filter combination the
 * admin has visited is still cached under its own key, and a document deleted
 * while filtered to `FAILED` would otherwise reappear the moment they switched
 * back to "all". Matching the prefix retires all of them at once.
 *
 * The whole list rather than a patched row, for the reason the personal corpus
 * gives: an upload changes the set, a delete changes it, and a re-ingest
 * changes a status the server owns — patching from a mutation response would
 * let the screen claim an ingest state the worker has not reached yet.
 */
export async function invalidateClinicDocumentQueries(queryClient: QueryClient): Promise<void> {
  const [listKeyPrefix] = getDocumentAdminControllerListDocumentsV1QueryKey();
  await queryClient.invalidateQueries({ queryKey: [listKeyPrefix] });
}
