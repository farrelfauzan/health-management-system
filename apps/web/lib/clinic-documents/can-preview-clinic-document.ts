import type { ClinicDocumentView } from '@hms/shared-types';

import { canPreviewDocumentMimeType } from '#lib/documents/can-preview-document-mime-type';

/**
 * Whether the corpus screen offers a preview for this row: Markdown and
 * plain text through the text preview, PDFs through the page viewer.
 */
export function canPreviewClinicDocument(document: ClinicDocumentView): boolean {
  return canPreviewDocumentMimeType(document.mimeType);
}
