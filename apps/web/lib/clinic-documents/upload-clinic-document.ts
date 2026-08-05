import type {
  DocumentLanguageValue,
  DocumentPurposeValue,
  DocumentUploadMimeTypeValue,
  DocumentVisibilityValue,
} from '@hms/shared-types';

import {
  documentAdminControllerConfirmUploadV1,
  documentAdminControllerCreateUploadUrlV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';

type UploadClinicDocumentParams = {
  file: File;
  title: string;
  mimeType: DocumentUploadMimeTypeValue;
  purpose: DocumentPurposeValue;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
};

type SignedUpload = {
  url: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
};

/**
 * The three-step browser-direct upload into the shared clinic corpus.
 *
 *   1. Ask HMS to sign an upload. Nothing is persisted — a URL nobody uses
 *      leaves no document behind.
 *   2. PUT the bytes straight to storage. They never proxy through the API,
 *      which is why a large PDF does not tie up a Node process.
 *   3. Confirm with the returned `storageKey`. The API reads the object's real
 *      size and type back from storage rather than believing this client, so
 *      steps 1 and 3 are the only ones that can create a row.
 *
 * `visibility` and `purpose` travel on the confirm and not on the signing
 * call, which is the same reason nothing else does: the signature covers the
 * bytes, and the document's meaning is only decided once there are bytes to
 * attach it to. Unlike the personal equivalent, both must be sent — a clinic
 * document has no owner to derive them from, and `visibility` is what decides
 * whether a patient can ever be shown the passage.
 */
export async function uploadClinicDocument({
  file,
  title,
  mimeType,
  purpose,
  visibility,
  language,
}: UploadClinicDocumentParams): Promise<void> {
  const signed = parseApiSuccess<SignedUpload>(
    await documentAdminControllerCreateUploadUrlV1({ mimeType, sizeBytes: file.size }),
    'Unable to start the upload.',
  );
  await putFileToSignedUrl(signed.data.url, file, signed.data.requiredHeaders);
  parseApiSuccess(
    await documentAdminControllerConfirmUploadV1({
      storageKey: signed.data.storageKey,
      title,
      purpose,
      visibility,
      language,
    }),
    'The file uploaded, but recording it failed.',
  );
}
