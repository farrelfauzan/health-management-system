import type {
  DocumentIngestStatusValue,
  DocumentLanguageValue,
  DocumentOwnerTypeValue,
  DocumentPurposeValue,
  DocumentVisibilityValue,
} from '#document-management/schemas';

/**
 * Repository projection of one stored document. Carries `Date` values rather
 * than the ISO strings of {@link ClinicDocumentView} — the service is what
 * serializes — and carries `storageKey`, which the service needs to mint a
 * download URL and never puts in a response.
 */
export type DocumentRecord = {
  id: string;
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose: DocumentPurposeValue;
  title: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  ingestError: string | null;
  ingestedAt: Date | null;
  chunkCount: number;
  uploadedById: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Create payload. `ownerType` and `ownerId` are explicit rather than defaulted
 * to the clinic corpus: the personal knowledge bases of `P15-T20` write
 * through this same repository, and a default here is how a private document
 * would end up in the shared corpus.
 */
export type CreateDocumentData = {
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose: DocumentPurposeValue;
  title: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  uploadedById: string;
};

/**
 * Metadata update payload. `ingestStatus` travels with it because an edit to
 * `visibility` or `language` invalidates the chunks copied from those fields,
 * and the status reset must land in the same write as the edit that caused it.
 */
export type UpdateDocumentData = {
  title?: string;
  visibility?: DocumentVisibilityValue;
  language?: DocumentLanguageValue;
  ingestStatus?: DocumentIngestStatusValue;
};

export type ListDocumentsParams = {
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose?: DocumentPurposeValue;
  ingestStatus?: DocumentIngestStatusValue;
  visibility?: DocumentVisibilityValue;
  language?: DocumentLanguageValue;
  cursor?: string;
  limit: number;
};

export type DocumentPage = {
  items: DocumentRecord[];
  nextCursor: string | null;
};

/**
 * The result of retiring a document: the soft-deleted row plus how many
 * chunks were discarded with it. Chunks are hard-deleted because retrieval
 * queries them directly — a soft-deleted parent with live chunks would still
 * answer questions.
 */
export type DeleteDocumentResult = {
  document: DocumentRecord;
  deletedAt: Date;
  chunksRemoved: number;
};

/**
 * `Uint8Array` rather than `Buffer` because this package is also compiled for
 * the browser: `Buffer` is a Node global, and one Node-only type here would
 * make the whole barrel unimportable from `apps/web`.
 */
/**
 * The ingestion pipeline's tuning. `maxChunksPerDocument` is a ceiling, not a
 * target: a document that produces more is truncated and says so on the row,
 * because one uploaded book must not become ten thousand embedding calls and
 * a corpus nobody meant to publish.
 */
export type DocumentIngestionConfig = {
  readonly isEnabled: boolean;
  readonly pollIntervalMs: number;
  readonly pollBatchLimit: number;
  readonly maxChunkCharacters: number;
  readonly chunkOverlapCharacters: number;
  readonly maxChunksPerDocument: number;
};

export type ExtractDocumentTextParams = {
  content: Uint8Array;
  mimeType: string;
};

/**
 * Text pulled out of a stored file, plus how many pages it came from —
 * reported so a PDF that yields one page of text out of forty is visible as
 * an extraction problem rather than a short document. Null for formats with
 * no page concept.
 */
export type ExtractDocumentTextResult = {
  text: string;
  pageCount: number | null;
};

export type SplitTextIntoChunksParams = {
  text: string;
  maxCharacters: number;
  overlapCharacters: number;
};

/**
 * One chunk on its way into the database. `embedding` is a plain number array
 * here; turning it into a pgvector literal is the repository's job, because
 * that is the only layer allowed to know how the column is written.
 *
 * `visibility` and `language` are copied from the parent document at this
 * point rather than joined at query time — retrieval filters and ranks in one
 * pass over the chunk table, and re-ingesting is what republishes them.
 */
export type CreateDocumentChunkData = {
  chunkIndex: number;
  content: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
};

export type ReplaceDocumentChunksParams = {
  documentId: string;
  chunks: readonly CreateDocumentChunkData[];
  ingestedAt: Date;
};

/**
 * What one ingestion attempt did. A `FAILED` outcome carries the reason that
 * was persisted on the document — never file content, since an extraction
 * error must not become a way to read a document the reader could not
 * otherwise open.
 */
export type IngestDocumentResult = {
  documentId: string;
  ingestStatus: DocumentIngestStatusValue;
  chunkCount: number;
  ingestError: string | null;
};
