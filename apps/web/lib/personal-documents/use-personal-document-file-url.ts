import type { PersonalDocumentDownloadView } from '@hms/shared-types';

import {
  getPersonalDocumentControllerGetDownloadUrlV1QueryKey,
  personalDocumentControllerGetDownloadUrlV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * A short-lived signed URL the PDF viewer reads one of the caller's own
 * documents from. Not cached past the dialog, for the same reason as the
 * corpus: a reopened preview mints a fresh link.
 */
export function usePersonalDocumentFileUrl(documentId: string, enabled = true) {
  const query = useApiQuery<PersonalDocumentDownloadView>({
    queryKey: getPersonalDocumentControllerGetDownloadUrlV1QueryKey(documentId),
    queryFn: (signal) => personalDocumentControllerGetDownloadUrlV1(documentId, signal),
    errorMessage: 'Failed to load the document',
    enabled: enabled && documentId !== '',
    options: { gcTime: 0, staleTime: 0 },
  });

  return { ...query, fileUrl: query.data?.url };
}
