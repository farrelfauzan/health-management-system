import type { ClinicDocumentPreviewView } from '@hms/shared-types';

import {
  documentAdminControllerGetPreviewV1,
  getDocumentAdminControllerGetPreviewV1QueryKey,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * A corpus document's text for the preview dialog.
 *
 * Fetched only while the dialog is open (`enabled`), never alongside the
 * list: the text is the largest thing about a document, and a table of
 * twenty rows should not pull twenty files to show their titles.
 */
export function useClinicDocumentPreview(documentId: string, enabled = true) {
  const query = useApiQuery<ClinicDocumentPreviewView>({
    queryKey: getDocumentAdminControllerGetPreviewV1QueryKey(documentId),
    queryFn: (signal) => documentAdminControllerGetPreviewV1(documentId, signal),
    errorMessage: 'Failed to load the document preview',
    enabled: enabled && documentId !== '',
  });

  return { ...query, preview: query.data };
}
