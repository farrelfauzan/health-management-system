import type { ManagedDocumentListView } from '@hms/shared-types';

import {
  getManagedDocumentControllerListDocumentsV1QueryKey,
  managedDocumentControllerListDocumentsV1,
} from '#lib/api/generated/documents/documents';
import type { ManagedDocumentControllerListDocumentsV1Params } from '#lib/api/generated/model/managedDocumentControllerListDocumentsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The registry list (`P16-T28`/`T36`). The API applies the per-row source
 * rule, so what comes back is exactly what this caller may open — the
 * client never filters rows itself.
 */
export function useManagedDocuments(params: ManagedDocumentControllerListDocumentsV1Params) {
  const query = useApiQuery<ManagedDocumentListView>({
    queryKey: getManagedDocumentControllerListDocumentsV1QueryKey(params),
    queryFn: (signal) => managedDocumentControllerListDocumentsV1(params, signal),
    errorMessage: 'Failed to load documents',
  });

  return {
    ...query,
    documents: query.data?.items ?? [],
    total: query.data?.meta.total ?? 0,
  };
}
