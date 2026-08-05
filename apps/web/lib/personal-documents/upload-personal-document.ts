import type { DocumentLanguageValue, DocumentUploadMimeTypeValue } from '@hms/shared-types';

import {
  personalDocumentControllerConfirmUploadV1,
  personalDocumentControllerCreateUploadUrlV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/personal-documents/put-file-to-signed-url';

type UploadPersonalDocumentParams = {
  file: File;
  title: string;
  mimeType: DocumentUploadMimeTypeValue;
  language: DocumentLanguageValue;
};

type SignedUpload = {
  url: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
};

/**
 * The three-step browser-direct upload.
 *
 *   1. Ask HMS to sign an upload. Nothing is persisted — a URL nobody uses
 *      leaves no document behind.
 *   2. PUT the bytes straight to storage. They never proxy through the API,
 *      which is why a large PDF does not tie up a Node process.
 *   3. Confirm with the returned `storageKey`. The API reads the object's real
 *      size and type back from storage rather than believing this client, so
 *      steps 1 and 3 are the only ones that can create a row.
 *
 * The key is passed through from step 1 untouched. It is server-minted, and
 * the API refuses to record a key it did not issue — so there is nothing to be
 * gained by constructing one here, and this function does not try.
 */
export async function uploadPersonalDocument({
  file,
  title,
  mimeType,
  language,
}: UploadPersonalDocumentParams): Promise<void> {
  const signed = parseApiSuccess<SignedUpload>(
    await personalDocumentControllerCreateUploadUrlV1({ mimeType, sizeBytes: file.size }),
    'Unable to start the upload.',
  );
  await putFileToSignedUrl(signed.data.url, file, signed.data.requiredHeaders);
  parseApiSuccess(
    await personalDocumentControllerConfirmUploadV1({
      storageKey: signed.data.storageKey,
      title,
      language,
    }),
    'The file uploaded, but recording it failed.',
  );
}
