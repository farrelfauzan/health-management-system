/**
 * A file whose type the document store does not accept, refused before any
 * request is made.
 *
 * A distinct class rather than a bare `Error` so a batch row can say "that
 * type is not accepted" instead of the generic "the upload failed" — the two
 * ask the person for completely different things, and only one of them is
 * worth retrying with the same file.
 */
export class UnsupportedDocumentTypeError extends Error {
  readonly fileName: string;
  constructor(fileName: string) {
    super(`Unsupported document type for ${fileName}`);
    this.name = 'UnsupportedDocumentTypeError';
    this.fileName = fileName;
  }
}
