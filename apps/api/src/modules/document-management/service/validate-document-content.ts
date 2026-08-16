import {
  DocumentContentValidationResult,
  ValidateDocumentContentParams,
} from '@hms/shared-types';

const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'ascii');
/**
 * How far back from the end of a PDF the trailer dictionary is searched for
 * an `/Encrypt` reference. The trailer sits at the end of the file; 8 KiB is
 * generous for any real trailer while keeping the check O(1) in file size.
 */
const PDF_TRAILER_SEARCH_WINDOW_BYTES = 8_192;
const PDF_ENCRYPT_MARKER = Buffer.from('/Encrypt', 'ascii');
const NUL_BYTE = 0;
/**
 * Signatures a text upload must not begin with (SJ-21). A match means the
 * client uploaded a binary under a `text/*` declaration — the renamed-
 * executable case the magic-byte check exists for. The list names the formats
 * worth calling out by name; the NUL-byte and UTF-8 checks below are what
 * actually close the class, since no text file contains a NUL and every
 * accepted text file must decode.
 */
const BINARY_MAGIC_SIGNATURES: ReadonlyArray<{ label: string; bytes: Buffer }> = [
  { label: 'Windows executable', bytes: Buffer.from('MZ', 'ascii') },
  { label: 'ELF executable', bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
  { label: 'Mach-O executable', bytes: Buffer.from([0xfe, 0xed, 0xfa, 0xce]) },
  { label: 'Mach-O executable', bytes: Buffer.from([0xfe, 0xed, 0xfa, 0xcf]) },
  { label: 'Mach-O executable', bytes: Buffer.from([0xcf, 0xfa, 0xed, 0xfe]) },
  { label: 'Mach-O executable', bytes: Buffer.from([0xca, 0xfe, 0xba, 0xbe]) },
  { label: 'ZIP archive', bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  { label: 'GZIP archive', bytes: Buffer.from([0x1f, 0x8b]) },
  { label: '7-Zip archive', bytes: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  { label: 'RAR archive', bytes: Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) },
  { label: 'PDF document', bytes: PDF_MAGIC_BYTES },
  { label: 'PNG image', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { label: 'JPEG image', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
  { label: 'GIF image', bytes: Buffer.from('GIF8', 'ascii') },
  { label: 'RIFF container', bytes: Buffer.from('RIFF', 'ascii') },
];

/**
 * Checks uploaded bytes against the MIME type their upload declared (SJ-21).
 *
 * The declared type was signed into the upload URL, so it is what the bucket
 * *believes* — this function is the only place the bytes themselves are asked
 * to agree. A PDF must open with the PDF magic bytes at offset zero (a
 * polyglot that buries `%PDF-` mid-file is refused) and must not be
 * encrypted, because an encrypted PDF cannot be inspected by anything
 * downstream. A text document must not open with a known binary signature,
 * must contain no NUL byte, and must decode as UTF-8.
 *
 * Pure over bytes on purpose: rejection consequences — deleting the object,
 * auditing, answering the client — belong to the caller, and a pure verdict
 * is what the acceptance tests can pin fixtures against.
 */
export function validateDocumentContent(
  params: ValidateDocumentContentParams,
): DocumentContentValidationResult {
  const content = Buffer.from(
    params.content.buffer,
    params.content.byteOffset,
    params.content.byteLength,
  );
  if (params.declaredMimeType === 'application/pdf') {
    return validatePdfContent(content);
  }
  return validateTextContent(content);
}

function validatePdfContent(content: Buffer): DocumentContentValidationResult {
  if (!hasPrefix(content, PDF_MAGIC_BYTES)) {
    return {
      isAccepted: false,
      reason: 'File does not begin with the PDF signature its upload declared',
    };
  }
  const trailerStart = Math.max(0, content.length - PDF_TRAILER_SEARCH_WINDOW_BYTES);
  if (content.subarray(trailerStart).includes(PDF_ENCRYPT_MARKER)) {
    return {
      isAccepted: false,
      reason: 'Encrypted PDFs are not accepted because their content cannot be inspected',
    };
  }
  return { isAccepted: true };
}

function validateTextContent(content: Buffer): DocumentContentValidationResult {
  const matchedSignature = BINARY_MAGIC_SIGNATURES.find((signature) =>
    hasPrefix(content, signature.bytes),
  );
  if (matchedSignature) {
    return {
      isAccepted: false,
      reason: `File declared as text begins with a ${matchedSignature.label} signature`,
    };
  }
  if (content.includes(NUL_BYTE)) {
    return {
      isAccepted: false,
      reason: 'File declared as text contains binary data',
    };
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return {
      isAccepted: false,
      reason: 'File declared as text is not valid UTF-8',
    };
  }
  return { isAccepted: true };
}

function hasPrefix(content: Buffer, prefix: Buffer): boolean {
  return content.length >= prefix.length && content.subarray(0, prefix.length).equals(prefix);
}
