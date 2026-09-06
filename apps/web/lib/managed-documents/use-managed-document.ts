import type { ManagedDocumentDetailView } from '@hms/shared-types';

import {
  getManagedDocumentControllerGetDocumentV1QueryKey,
  managedDocumentControllerGetDocumentV1,
} from '#lib/api/generated/documents/documents';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * One registry document with its body and its type's approval policy
 * (`P16-T31`). The policy travels on the row so the workspace knows in one
 * request whether this document has an approval half at all — a screen that
 * fetched the type separately would flash the approver panel on a type that
 * needs no approval (US-E5-06).
 */
export function useManagedDocument(documentId: string) {
  const query = useApiQuery<ManagedDocumentDetailView>({
    queryKey: getManagedDocumentControllerGetDocumentV1QueryKey(documentId),
    queryFn: (signal) => managedDocumentControllerGetDocumentV1(documentId, signal),
    errorMessage: 'Failed to load the document',
    // `P16-T32`: the template editor asks for the registry row governing a
    // template, and there is none until the clinic switches the policy on.
    // An empty id is "nothing to fetch", not a request to make and fail.
    enabled: documentId !== '',
  });

  return { ...query, document: query.data };
}
