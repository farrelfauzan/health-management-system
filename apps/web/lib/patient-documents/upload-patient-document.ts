import type {
  DocumentCategoryValue,
  DocumentUploadMimeTypeValue,
  PatientDocumentUploadUrlView,
} from '@hms/shared-types';

import {
  patientDocumentControllerConfirmUploadV1,
  patientDocumentControllerCreateUploadUrlV1,
} from '#lib/api/generated/document-management/document-management';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { PatientDocumentUploadError } from '#lib/patient-documents/patient-document-upload-error';

type UploadPatientDocumentParams = {
  patientId: string;
  file: File;
  mimeType: DocumentUploadMimeTypeValue;
  title: string;
  category: DocumentCategoryValue;
  documentDate?: string;
  notes?: string;
  encounterId?: string;
  admissionId?: string;
  onProgress?: (progress: DocumentUploadProgress) => void;
};

type UploadPatientDocumentResult = {
  outcome: 'recorded' | 'already-recorded';
};

const HTTP_CONFLICT = 409;

async function executeSignedPut({
  patientId,
  file,
  mimeType,
  onProgress,
}: UploadPatientDocumentParams): Promise<string> {
  onProgress?.({ stage: 'preparing' });
  let signed: PatientDocumentUploadUrlView;
  try {
    signed = parseApiSuccess<PatientDocumentUploadUrlView>(
      await patientDocumentControllerCreateUploadUrlV1(patientId, {
        mimeType,
        sizeBytes: file.size,
      }),
      'Unable to start the upload.',
    ).data;
  } catch (err) {
    throw new PatientDocumentUploadError('sign', err);
  }
  onProgress?.({ stage: 'uploading', percent: 0 });
  try {
    await putFileToSignedUrl(signed.url, file, signed.requiredHeaders, (percent) =>
      onProgress?.({ stage: 'uploading', percent }),
    );
  } catch (err) {
    throw new PatientDocumentUploadError('put', err);
  }
  return signed.storageKey;
}

/**
 * A storage rejection is retried exactly once, with a freshly signed URL.
 * The first URL is not reused on purpose: a signed URL that failed may have
 * expired mid-upload or been rejected for the object it names, and either way
 * a second PUT against it is the same request again. A fresh signature is a
 * new object under a new server-minted key, and nothing was recorded under
 * the old one, so the abandoned key leaves no row behind.
 */
async function executeSignedPutWithRetry(params: UploadPatientDocumentParams): Promise<string> {
  try {
    return await executeSignedPut(params);
  } catch (err) {
    if (err instanceof PatientDocumentUploadError && err.stage === 'put') {
      return executeSignedPut(params);
    }
    throw err;
  }
}

async function executeConfirm(
  params: UploadPatientDocumentParams,
  storageKey: string,
): Promise<UploadPatientDocumentResult> {
  try {
    const response = await patientDocumentControllerConfirmUploadV1(params.patientId, {
      storageKey,
      title: params.title,
      category: params.category,
      ...(params.documentDate ? { documentDate: params.documentDate } : {}),
      ...(params.notes ? { notes: params.notes } : {}),
      ...(params.encounterId ? { encounterId: params.encounterId } : {}),
      ...(params.admissionId ? { admissionId: params.admissionId } : {}),
    });
    if (response.status === HTTP_CONFLICT) {
      return { outcome: 'already-recorded' };
    }
    parseApiSuccess(response, 'The file uploaded, but recording it failed.');
    return { outcome: 'recorded' };
  } catch (err) {
    // A conflict on confirm means this exact storage key is already a row —
    // the confirm went through and the response was lost, or the person
    // double-clicked. The document exists, and the honest outcome is
    // "already recorded", not a failure asking them to upload it again.
    if (isApiStatusError(err, HTTP_CONFLICT)) {
      return { outcome: 'already-recorded' };
    }
    throw new PatientDocumentUploadError('confirm', err);
  }
}

/**
 * The three-step browser-direct upload of one patient clinical file
 * (`P16-T08`): sign, PUT to storage, confirm. The same shape as the
 * knowledge-base uploads and for the same reasons — bytes never proxy
 * through the API, the storage key is server-minted and passed back
 * untouched, and only the confirm call can create a row.
 *
 * What differs is the failure handling, because a clinical file is the kind
 * of upload a clinician does between patients and will not redo happily:
 * storage rejections get one retry with a fresh URL, a `409` on confirm is
 * reported as already recorded, and every other failure says which step it
 * was so the dialog can tell the person what to do about it.
 */
export async function uploadPatientDocument(
  params: UploadPatientDocumentParams,
): Promise<UploadPatientDocumentResult> {
  const storageKey = await executeSignedPutWithRetry(params);
  params.onProgress?.({ stage: 'scanning' });
  const result = await executeConfirm(params, storageKey);
  params.onProgress?.({ stage: 'complete' });
  return result;
}
