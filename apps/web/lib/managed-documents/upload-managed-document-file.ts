import type { DocumentUploadMimeTypeValue, ManagedDocumentUploadUrlView } from '@hms/shared-types';

import { managedDocumentControllerCreateUploadUrlV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { ManagedDocumentUploadError } from '#lib/managed-documents/managed-document-upload-error';

type UploadManagedDocumentFileParams = {
  file: File;
  mimeType: DocumentUploadMimeTypeValue;
  onProgress?: (progress: DocumentUploadProgress) => void;
};

/**
 * The sign-and-PUT half of recording an uploaded body (`P16-T36`): mint a
 * key under the registry prefix, PUT the bytes straight to storage, and hand
 * back the key for the create call. Recording is the caller's — it is one
 * POST with the rest of the document, so a form failure after a successful
 * PUT leaves a staged object and no row, never a row and no object.
 *
 * A storage rejection is retried once with a fresh signature: a URL that
 * failed may have expired mid-upload, and a second PUT against it is the
 * same request again.
 */
export async function uploadManagedDocumentFile(
  params: UploadManagedDocumentFileParams,
): Promise<string> {
  try {
    return await executeSignedPut(params);
  } catch (err) {
    if (err instanceof ManagedDocumentUploadError && err.stage === 'put') {
      return executeSignedPut(params);
    }
    throw err;
  }
}

async function executeSignedPut({
  file,
  mimeType,
  onProgress,
}: UploadManagedDocumentFileParams): Promise<string> {
  onProgress?.({ stage: 'preparing' });
  let signed: ManagedDocumentUploadUrlView;
  try {
    signed = parseApiSuccess<ManagedDocumentUploadUrlView>(
      await managedDocumentControllerCreateUploadUrlV1({ mimeType, sizeBytes: file.size }),
      'Unable to start the upload.',
    ).data;
  } catch (err) {
    throw new ManagedDocumentUploadError('sign', err);
  }
  onProgress?.({ stage: 'uploading', percent: 0 });
  try {
    await putFileToSignedUrl(signed.url, file, signed.requiredHeaders, (percent) =>
      onProgress?.({ stage: 'uploading', percent }),
    );
  } catch (err) {
    throw new ManagedDocumentUploadError('put', err);
  }
  return signed.storageKey;
}
