import type { PersonalDocumentPreviewView } from '@hms/shared-types';

import {
  getPersonalDocumentControllerGetPreviewV1QueryKey,
  personalDocumentControllerGetPreviewV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * One of the caller's own documents as text, for the preview dialog.
 * Fetched only while the dialog is open (`enabled`), never alongside the
 * list, for the same reason as the clinic corpus preview.
 */
export function usePersonalDocumentPreview(documentId: string, enabled = true) {
  const query = useApiQuery<PersonalDocumentPreviewView>({
    queryKey: getPersonalDocumentControllerGetPreviewV1QueryKey(documentId),
    queryFn: (signal) => personalDocumentControllerGetPreviewV1(documentId, signal),
    errorMessage: 'Failed to load the document preview',
    enabled: enabled && documentId !== '',
  });

  return { ...query, preview: query.data };
}
