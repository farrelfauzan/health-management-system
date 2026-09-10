import {
  isManagedDocumentPreviewMimeType,
  type ManagedDocumentDetailView,
} from '@hms/shared-types';

/**
 * Whether this document has text the app can show (`P19-T18`).
 *
 * The client asks first so it never fires a request the API would answer
 * `MANAGED_DOCUMENT_NOT_PREVIEWABLE` — a PDF, an image, or a body drafted in
 * the editor would otherwise cost a round trip to learn what the row already
 * says. Both sides read the same allowlist from `@hms/shared-types`, so a
 * type added to one is added to both.
 */
export function canPreviewManagedDocument(document: ManagedDocumentDetailView): boolean {
  return document.storageKey !== null && isManagedDocumentPreviewMimeType(document.storageMimeType);
}
