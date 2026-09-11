import { isManagedDocumentPreviewMimeType, type PersonalDocumentView } from '@hms/shared-types';

/**
 * Whether a "My documents" row offers a preview. Reads the same allowlist
 * the API enforces, so the button never offers a request the API would
 * refuse with `PERSONAL_DOCUMENT_NOT_PREVIEWABLE`; a PDF keeps its download.
 */
export function canPreviewPersonalDocument(document: PersonalDocumentView): boolean {
  return isManagedDocumentPreviewMimeType(document.mimeType);
}
