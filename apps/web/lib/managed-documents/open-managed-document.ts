import type { ManagedDocumentDownloadView } from '@hms/shared-types';

import { managedDocumentControllerGetDownloadUrlV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';

type OpenManagedDocumentParams = {
  documentId: string;
  errorMessage: string;
};

/**
 * Mints a signed download URL for an uploaded body and opens it in a new
 * tab. The URL is fetched per click and never stored: it expires in
 * minutes and every mint is audited, so a cached one would be both dead
 * and a lie in the log. Served with attachment disposition (NFR-SEC-04).
 */
export async function openManagedDocument(params: OpenManagedDocumentParams): Promise<void> {
  const download = parseApiSuccess<ManagedDocumentDownloadView>(
    await managedDocumentControllerGetDownloadUrlV1(params.documentId),
    params.errorMessage,
  ).data;
  window.open(download.url, '_blank', 'noopener,noreferrer');
}
