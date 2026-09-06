import type { ManagedDocumentHistoryView } from '@hms/shared-types';

import {
  getManagedDocumentControllerGetHistoryV1QueryKey,
  managedDocumentControllerGetHistoryV1,
} from '#lib/api/generated/documents/documents';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * A document's audit trail and every approval round it has been through
 * (`P16-T30`, FR-E5-05). The rounds are the half a drafter comes back for:
 * a rejection keeps its reason here forever (US-E5-03).
 */
export function useManagedDocumentHistory(documentId: string) {
  const query = useApiQuery<ManagedDocumentHistoryView>({
    queryKey: getManagedDocumentControllerGetHistoryV1QueryKey(documentId),
    queryFn: (signal) => managedDocumentControllerGetHistoryV1(documentId, signal),
    errorMessage: 'Failed to load the document history',
  });

  return { ...query, rounds: query.data?.rounds ?? [], entries: query.data?.entries ?? [] };
}
