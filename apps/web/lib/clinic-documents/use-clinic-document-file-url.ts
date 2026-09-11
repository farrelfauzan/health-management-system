import type { ClinicDocumentDownloadView } from '@hms/shared-types';

import {
  documentAdminControllerGetDownloadUrlV1,
  getDocumentAdminControllerGetDownloadUrlV1QueryKey,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * A short-lived signed URL the PDF viewer reads a corpus document from.
 *
 * Not cached past the dialog (`gcTime: 0`): the URL expires on its own, and
 * a reopened preview must mint a fresh one rather than hand the viewer a
 * link that may already have lapsed.
 */
export function useClinicDocumentFileUrl(documentId: string, enabled = true) {
  const query = useApiQuery<ClinicDocumentDownloadView>({
    queryKey: getDocumentAdminControllerGetDownloadUrlV1QueryKey(documentId),
    queryFn: (signal) => documentAdminControllerGetDownloadUrlV1(documentId, signal),
    errorMessage: 'Failed to load the document',
    enabled: enabled && documentId !== '',
    options: { gcTime: 0, staleTime: 0 },
  });

  return { ...query, fileUrl: query.data?.url };
}
