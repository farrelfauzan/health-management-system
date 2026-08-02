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
