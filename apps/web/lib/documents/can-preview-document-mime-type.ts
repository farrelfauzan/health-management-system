import { isManagedDocumentPreviewMimeType } from '@hms/shared-types';

import { isPdfMimeType } from '#lib/documents/is-pdf-mime-type';

/**
 * Which stored files the preview dialog can show: Markdown and plain text as
 * text (the API's allowlist), and PDFs as rendered pages. Images and
 * anything else keep only the download.
 */
export function canPreviewDocumentMimeType(mimeType: string): boolean {
  return isManagedDocumentPreviewMimeType(mimeType) || isPdfMimeType(mimeType);
}
