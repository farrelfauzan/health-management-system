import type { ManagedDocumentPreviewView } from '@hms/shared-types';

import {
  getManagedDocumentControllerGetPreviewV1QueryKey,
  managedDocumentControllerGetPreviewV1,
} from '#lib/api/generated/documents/documents';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * An uploaded document's text, for whoever is being asked to approve it
 * (`P19-T18`).
 *
 * Separate from `useManagedDocument` rather than folded into the detail
 * response: the text is the largest thing about a document and every list
 * row, badge and header read that response today. Fetching it only where it
 * is read keeps the workspace's first paint the size it already is, and lets
 * a preview that fails do so without taking the rest of the screen with it.
 */
export function useManagedDocumentPreview(documentId: string, enabled = true) {
  const query = useApiQuery<ManagedDocumentPreviewView>({
    queryKey: getManagedDocumentControllerGetPreviewV1QueryKey(documentId),
    queryFn: (signal) => managedDocumentControllerGetPreviewV1(documentId, signal),
    errorMessage: 'Failed to load the document preview',
    enabled: enabled && documentId !== '',
  });

  return { ...query, preview: query.data };
}
