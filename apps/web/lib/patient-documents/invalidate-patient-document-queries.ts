import type { QueryClient } from '@tanstack/react-query';

import { getPatientDocumentControllerListDocumentsV1QueryKey } from '#lib/api/generated/document-management/document-management';

/**
 * Refetches every filtered list for one patient after any mutation.
 *
 * The generated key is `[url, params?]`, so the unfiltered key is a prefix
 * of every filtered one and a single invalidation reaches them all. Patching
 * a row in place from a mutation response would not: an upload changes which
 * rows a category filter matches, and a delete changes every page after it.
 */
export async function invalidatePatientDocumentQueries(
  queryClient: QueryClient,
  patientId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getPatientDocumentControllerListDocumentsV1QueryKey(patientId),
  });
}
