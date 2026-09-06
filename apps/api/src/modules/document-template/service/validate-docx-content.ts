import { DocxContentValidationResult } from '@hms/shared-types';

/** `PK\x03\x04` — the local file header every ZIP entry starts with. */
const ZIP_LOCAL_HEADER_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const DOCUMENT_PART_NAME = 'word/document.xml';

/**
 * Magic-byte check for a Word file (`P16-T42`), run at the first point the
 * server holds the bytes, as `docs/security/file-uploads.md` requires.
 *
 * A `.docx` is a ZIP with `word/document.xml` inside. The signature has to
 * sit at offset zero — a polyglot with a prologue is refused — and the part
 * name has to appear in the archive's directory. A password-protected Word
 * file is an OLE compound file, not a ZIP, and fails the first check: an
 * archive the server cannot open is not an accepted type.
 */
export function validateDocxContent(content: Uint8Array): DocxContentValidationResult {
  const hasZipSignature = ZIP_LOCAL_HEADER_SIGNATURE.every(
    (byte, index) => content[index] === byte,
  );
  if (!hasZipSignature) {
    return { isAccepted: false, reason: 'Uploaded file is not a Word (.docx) document' };
  }
  const hasDocumentPart = Buffer.from(content).includes(DOCUMENT_PART_NAME);
  if (!hasDocumentPart) {
    return { isAccepted: false, reason: 'Uploaded archive carries no Word document' };
  }
  return { isAccepted: true };
}
