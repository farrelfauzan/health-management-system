import type { PersonalDocumentView } from '@hms/shared-types';

import { canPreviewDocumentMimeType } from '#lib/documents/can-preview-document-mime-type';

/**
 * Whether a "My documents" row offers a preview: Markdown and plain text
 * through the text preview, PDFs through the page viewer.
 */
export function canPreviewPersonalDocument(document: PersonalDocumentView): boolean {
  return canPreviewDocumentMimeType(document.mimeType);
}
