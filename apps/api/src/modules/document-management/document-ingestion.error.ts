/**
 * A failure reason safe to persist on `Document.ingestError`.
 *
 * The distinction this type exists to draw: messages of this class are
 * **authored here**, so they are known to contain no document content.
 * Anything else thrown during ingestion — by a PDF parser, an S3 client, an
 * embedding host — is a message this codebase does not control, and a parser
 * is entirely free to quote the bytes it choked on. Since `ingestError` is
 * readable by anyone who can list documents, an unrecognized error becomes a
 * category, not a quotation.
 */
export class DocumentIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentIngestionError';
  }
}
