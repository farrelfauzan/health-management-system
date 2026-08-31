import { DOCUMENT_UPLOAD_MIME_TYPES, type DocumentUploadMimeTypeValue } from '@hms/shared-types';

/**
 * Whether the browser's reported type is one the document store accepts.
 *
 * Shared by the file picker and by the two upload flows so the surface's
 * allowlist is stated once. It is a courtesy check either way: `File.type` is
 * whatever the OS guessed, and the API re-checks the declared type before
 * signing and reads the bytes themselves at confirm.
 */
export function isAcceptedDocumentMimeType(value: string): value is DocumentUploadMimeTypeValue {
  return DOCUMENT_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === value);
}
