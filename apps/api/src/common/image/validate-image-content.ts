import { ImageContentValidationResult, ValidateImageContentParams } from './image.types';

const JPEG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_MAGIC_BYTES = Buffer.from('RIFF', 'ascii');
const WEBP_FORM_TYPE = Buffer.from('WEBP', 'ascii');
/** Where a RIFF container names its form type, after the 4-byte size field. */
const WEBP_FORM_TYPE_OFFSET = 8;
const WEBP_HEADER_LENGTH = 12;

/**
 * Checks uploaded bytes against the image MIME type their upload declared
 * (SJ-21, `docs/security/file-uploads.md` §3).
 *
 * The declared type was signed into the upload URL, so it is what the bucket
 * believes; this is the only place the bytes themselves are asked to agree.
 * The signature must sit at offset zero — a file that buries a PNG header
 * after a prologue is a polyglot, not a PNG, and the point of the check is
 * that the first thing a decoder sees is the thing that was declared.
 *
 * This is a gate, not the defence. The defence is the re-encode that follows
 * it: bytes that pass here are still decoded and rewritten from scratch, so a
 * malformed image that a signature check cannot see does not survive to
 * storage either. What the gate buys is a cheap, readable rejection for the
 * renamed-file case before a decoder is handed anything at all.
 *
 * Pure over bytes on purpose: deleting the object, auditing, and answering
 * the client belong to the caller, mirroring `validateDocumentContent`.
 */
export function validateImageContent(
  params: ValidateImageContentParams,
): ImageContentValidationResult {
  const content = Buffer.from(
    params.content.buffer,
    params.content.byteOffset,
    params.content.byteLength,
  );
  if (content.byteLength === 0) {
    return { isAccepted: false, reason: 'Uploaded file is empty' };
  }
  if (params.declaredMimeType === 'image/jpeg') {
    return toVerdict(content.subarray(0, JPEG_MAGIC_BYTES.length).equals(JPEG_MAGIC_BYTES), 'JPEG');
  }
  if (params.declaredMimeType === 'image/png') {
    return toVerdict(content.subarray(0, PNG_MAGIC_BYTES.length).equals(PNG_MAGIC_BYTES), 'PNG');
  }
  if (params.declaredMimeType === 'image/webp') {
    return toVerdict(isWebp(content), 'WebP');
  }
  return {
    isAccepted: false,
    reason: `Uploaded file declares an unsupported image type (${params.declaredMimeType})`,
  };
}

/**
 * WebP is a RIFF container, so the signature is split: the `RIFF` fourCC, a
 * little-endian chunk size, then the `WEBP` form type. Checking only `RIFF`
 * would also accept a WAV file.
 */
function isWebp(content: Buffer): boolean {
  if (content.byteLength < WEBP_HEADER_LENGTH) {
    return false;
  }
  return (
    content.subarray(0, RIFF_MAGIC_BYTES.length).equals(RIFF_MAGIC_BYTES) &&
    content
      .subarray(WEBP_FORM_TYPE_OFFSET, WEBP_FORM_TYPE_OFFSET + WEBP_FORM_TYPE.length)
      .equals(WEBP_FORM_TYPE)
  );
}

function toVerdict(hasSignature: boolean, label: string): ImageContentValidationResult {
  if (hasSignature) {
    return { isAccepted: true };
  }
  return {
    isAccepted: false,
    reason: `Uploaded file does not start with a ${label} signature`,
  };
}
