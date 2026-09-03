import type { PatientDocumentDownloadView } from '@hms/shared-types';

import { patientDocumentDetailControllerGetDownloadUrlV1 } from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';

type OpenPatientDocumentParams = {
  documentId: string;
  /**
   * The encounter the reader currently has open, when there is one (P16-T14).
   *
   * This is *where the file is being read from*, not where it belongs — a
   * history document opened inside today's consultation has a different answer
   * to each — and the API records the two separately in the audit row. The
   * server validates it against the document's patient and the caller's access
   * to that encounter, so passing it is a claim, not an assertion.
   */
  readFromEncounterId?: string;
  errorMessage: string;
};

/**
 * Mints a fresh signed URL and opens it.
 *
 * Never cached: the URL expires in minutes and every mint is audited, so a
 * stored one would be both dead and a lie in the access log — the second
 * reader of a reused URL leaves no trace at all.
 */
export async function openPatientDocument(params: OpenPatientDocumentParams): Promise<void> {
  const response = parseApiSuccess<PatientDocumentDownloadView>(
    await patientDocumentDetailControllerGetDownloadUrlV1(
      params.documentId,
      params.readFromEncounterId === undefined
        ? undefined
        : { encounterId: params.readFromEncounterId },
    ),
    params.errorMessage,
  );
  window.open(response.data.url, '_blank', 'noopener,noreferrer');
}
