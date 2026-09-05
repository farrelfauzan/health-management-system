import { DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE } from '@hms/shared-types';

const DOCX_EXTENSION = '.docx';

/**
 * Browsers report an empty `type` for a `.docx` picked on some platforms,
 * so the extension is accepted as the fallback signal. The server decides
 * on the bytes either way; this only spares a pointless upload.
 */
export function isDocxFile(file: File): boolean {
  if (file.type === DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE) {
    return true;
  }
  return file.type === '' && file.name.toLowerCase().endsWith(DOCX_EXTENSION);
}
