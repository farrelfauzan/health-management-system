import type { DocumentLanguageValue, DocumentUploadMimeTypeValue } from '@hms/shared-types';

import {
  personalDocumentControllerConfirmUploadV1,
  personalDocumentControllerCreateUploadUrlV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

type UploadPersonalDocumentParams = {
  file: File;
  title: string;
  mimeType: DocumentUploadMimeTypeValue;
  language: DocumentLanguageValue;
  onProgress?: (progress: DocumentUploadProgress) => void;
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
 *
 * `onProgress` narrates the three steps for the dialog's progress bar:
 * `preparing` while the URL is signed, `uploading` with a byte-accurate
 * percentage while the PUT runs, `scanning` while the confirm call has the
 * API reading the object back through the SJ-21 content checks, and
 * `complete` once the row exists.
 */
export async function uploadPersonalDocument({
  file,
  title,
  mimeType,
  language,
  onProgress,
}: UploadPersonalDocumentParams): Promise<void> {
  onProgress?.({ stage: 'preparing' });
  const signed = parseApiSuccess<SignedUpload>(
    await personalDocumentControllerCreateUploadUrlV1({ mimeType, sizeBytes: file.size }),
    'Unable to start the upload.',
  );
  onProgress?.({ stage: 'uploading', percent: 0 });
  await putFileToSignedUrl(signed.data.url, file, signed.data.requiredHeaders, (percent) =>
    onProgress?.({ stage: 'uploading', percent }),
  );
  onProgress?.({ stage: 'scanning' });
  parseApiSuccess(
    await personalDocumentControllerConfirmUploadV1({
      storageKey: signed.data.storageKey,
      title,
      language,
    }),
    'The file uploaded, but recording it failed.',
  );
  onProgress?.({ stage: 'complete' });
}
