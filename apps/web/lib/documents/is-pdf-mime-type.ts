const PDF_MIME_TYPE = 'application/pdf';

/** Whether a stored file is a PDF, which the preview renders as pages rather than as text. */
export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === PDF_MIME_TYPE;
}
