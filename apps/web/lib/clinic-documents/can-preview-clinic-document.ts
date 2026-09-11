import { isManagedDocumentPreviewMimeType, type ClinicDocumentView } from '@hms/shared-types';

/**
 * Whether the corpus screen offers a preview for this row.
 *
 * Reads the same allowlist the API enforces, so the button never offers a
 * request the API would refuse with `CLINIC_DOCUMENT_NOT_PREVIEWABLE`. A PDF
 * gets no preview button and keeps its download.
 */
export function canPreviewClinicDocument(document: ClinicDocumentView): boolean {
  return isManagedDocumentPreviewMimeType(document.mimeType);
}
