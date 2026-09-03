import { vaultDocumentControllerGetDownloadUrlV1 } from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';

type DownloadView = { url: string; expiresAt: string };

/**
 * Opens one of the caller's own vault documents.
 *
 * The signed URL is fetched at click time rather than rendered into the row.
 * It is valid for minutes and the API audits the access before returning it,
 * so a URL sitting in the DOM would be both an expired link and an access
 * recorded for a document nobody opened.
 */
export async function downloadVaultDocument(documentId: string): Promise<string> {
  const response = parseApiSuccess<DownloadView>(
    await vaultDocumentControllerGetDownloadUrlV1(documentId),
    'Unable to open this document.',
  );
  return response.data.url;
}
