import type {
  DocumentLanguageValue,
  DocumentUploadMimeTypeValue,
  VaultDocumentCategoryValue,
} from '@hms/shared-types';

import {
  vaultDocumentControllerConfirmUploadV1,
  vaultDocumentControllerCreateUploadUrlV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

type UploadVaultDocumentParams = {
  file: File;
  title: string;
  mimeType: DocumentUploadMimeTypeValue;
  language: DocumentLanguageValue;
  vaultCategory?: VaultDocumentCategoryValue;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  onProgress?: (progress: DocumentUploadProgress) => void;
};

type SignedUpload = {
  url: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
};

/**
 * The three-step browser-direct upload into the caller's own vault
 * (`P16-T18`), matching `uploadPersonalDocument` step for step but calling
 * the vault routes.
 *
 *   1. Ask HMS to sign an upload. Nothing is persisted — a URL nobody uses
 *      leaves no document behind.
 *   2. PUT the bytes straight to storage, so a large scan never proxies
 *      through a Node process.
 *   3. Confirm with the returned `storageKey`, together with the filing
 *      metadata. The API reads the object's real size and type back from
 *      storage rather than believing this client.
 *
 * A deliberately separate function rather than a shared one with a surface
 * flag. The two upload paths mint keys under different prefixes and confirm
 * against different routes, and each refuses a key issued for the other —
 * a shared helper with a branch is exactly how a doctor's KTP would end up
 * confirmed into the corpus whose passages go to an embedding provider.
 */
export async function uploadVaultDocument({
  file,
  title,
  mimeType,
  language,
  vaultCategory,
  referenceNumber,
  issuedAt,
  expiresAt,
  onProgress,
}: UploadVaultDocumentParams): Promise<void> {
  onProgress?.({ stage: 'preparing' });
  const signed = parseApiSuccess<SignedUpload>(
    await vaultDocumentControllerCreateUploadUrlV1({ mimeType, sizeBytes: file.size }),
    'Unable to start the upload.',
  );
  onProgress?.({ stage: 'uploading', percent: 0 });
  await putFileToSignedUrl(signed.data.url, file, signed.data.requiredHeaders, (percent) =>
    onProgress?.({ stage: 'uploading', percent }),
  );
  onProgress?.({ stage: 'scanning' });
  parseApiSuccess(
    await vaultDocumentControllerConfirmUploadV1({
      storageKey: signed.data.storageKey,
      title,
      language,
      vaultCategory,
      referenceNumber,
      issuedAt,
      expiresAt,
    }),
    'The file uploaded, but recording it failed.',
  );
  onProgress?.({ stage: 'complete' });
}
