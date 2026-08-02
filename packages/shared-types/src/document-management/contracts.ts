import type {
  DocumentIngestStatusValue,
  DocumentLanguageValue,
  DocumentOwnerTypeValue,
  DocumentPurposeValue,
  DocumentVisibilityValue,
} from '#document-management/schemas';

/**
 * A signed browser-direct upload. `requiredHeaders` must be sent verbatim on
 * the PUT — they are part of the signature, so a request that omits or
 * changes one is rejected by the provider rather than stored under different
 * metadata.
 *
 * `storageKey` is the only part of this response the client sends back: it is
 * what the confirm call names, and it is server-minted, so a caller can never
 * attach a row to an object of its own choosing.
 */
export type ClinicDocumentUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

/**
 * Admin-facing view of one stored document.
 *
 * `storageKey` is deliberately absent: the key is an internal handle, and
 * every download is a short-lived signed URL minted per request (D-018), so
 * exposing the key would create a second, unexpiring way to name the object.
 *
 * `chunkCount` is what tells an operator whether the document is actually
 * searchable. A `READY` status with zero chunks is a document that extracted
 * to nothing, and without the count that reads identically to a working one.
 */
export type ClinicDocumentView = {
  id: string;
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose: DocumentPurposeValue;
  title: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  ingestError: string | null;
  ingestedAt: string | null;
  chunkCount: number;
  uploadedById: string;
  createdAt: string;
  updatedAt: string;
};

export type ClinicDocumentListView = {
  items: ClinicDocumentView[];
  nextCursor: string | null;
};

/**
 * A short-lived signed download URL. Never persisted and never returned as
 * part of a document view — it is minted per request so it expires on its
 * own rather than living in a client's cached list forever.
 */
export type ClinicDocumentDownloadView = {
  url: string;
  expiresAt: string;
};

/**
 * The outcome of retiring a document. `chunksRemoved` is reported rather than
 * implied: deletion is what makes a document stop being retrievable, and the
 * count is the operator's evidence that it did.
 */
export type DeletedClinicDocumentView = {
  id: string;
  deletedAt: string;
  chunksRemoved: number;
};
