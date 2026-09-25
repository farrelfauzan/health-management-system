import { parseApiSuccess } from '#lib/api/response';
import { openPatientDocument } from '#lib/patient-documents/open-patient-document';

type OpenIssuedClinicalDocumentParams = {
  /** The issue call's raw response: every clinical letter route answers `{ data: { documentId } }`. */
  response: { status: number; data: unknown };
  /** Where the letter is being read from, for the access log (P16-T14). */
  readFromEncounterId?: string;
  issueErrorMessage: string;
  openErrorMessage: string;
};

/**
 * Opens the PDF a clinical letter route just filed — a resep, a surat
 * pengantar, a surat rujukan, a surat keterangan hamil or lahir.
 *
 * Every one of those routes renders the letter and files it as a patient
 * document, then answers with its id; the signed URL comes from the same
 * patient-document download every other clinical file uses, so the read is
 * audited like any other and nothing is cached.
 */
export async function openIssuedClinicalDocument(
  params: OpenIssuedClinicalDocumentParams,
): Promise<void> {
  const issued = parseApiSuccess<{ documentId: string }>(params.response, params.issueErrorMessage);
  await openPatientDocument({
    documentId: issued.data.documentId,
    readFromEncounterId: params.readFromEncounterId,
    errorMessage: params.openErrorMessage,
  });
}
