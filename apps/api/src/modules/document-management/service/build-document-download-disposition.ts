import { DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE, DocumentRecord } from '@hms/shared-types';

const ASCII_FILENAME_SAFE_PATTERN = /[^a-zA-Z0-9 ._-]/g;
const COLLAPSE_WHITESPACE_PATTERN = /\s+/g;
const MAX_FILENAME_STEM_LENGTH = 80;
const FALLBACK_FILENAME_STEM = 'document';

/**
 * Builds the `Content-Disposition` value signed into a document download URL
 * (SJ-21): always `attachment`, so the storage origin never renders a stored
 * file inline, with the document title as the suggested filename.
 *
 * The title is user text headed into an HTTP header, so it is emitted twice
 * per RFC 6266/5987: an ASCII-only `filename` fallback stripped of anything
 * that could terminate or continue the header (quotes, control bytes, CR/LF
 * are all outside the allowed class), and a UTF-8 `filename*` that carries
 * the real title percent-encoded. Header injection is impossible in both
 * because neither emits a byte outside its encoding's safe set.
 */
export function buildDocumentDownloadDisposition(
  record: Pick<DocumentRecord, 'title' | 'mimeType'>,
): string {
  const extension = DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE[
    record.mimeType as keyof typeof DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE
  ];
  const extensionSuffix = extension === undefined ? '' : `.${extension}`;
  const asciiStem = buildAsciiFilenameStem(record.title);
  const encodedStem = encodeRfc5987(truncateStem(record.title.trim()) || FALLBACK_FILENAME_STEM);
  return `attachment; filename="${asciiStem}${extensionSuffix}"; filename*=UTF-8''${encodedStem}${extensionSuffix}`;
}

function buildAsciiFilenameStem(title: string): string {
  const sanitized = title
    .replace(ASCII_FILENAME_SAFE_PATTERN, '')
    .replace(COLLAPSE_WHITESPACE_PATTERN, ' ')
    .trim();
  return truncateStem(sanitized) || FALLBACK_FILENAME_STEM;
}

function truncateStem(stem: string): string {
  return stem.slice(0, MAX_FILENAME_STEM_LENGTH);
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
