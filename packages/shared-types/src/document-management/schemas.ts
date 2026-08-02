import { z } from 'zod';

/**
 * Who a document belongs to. Mirrors the Prisma `DocumentOwnerType` enum.
 * `CLINIC` is the shared corpus every channel may read subject to
 * visibility; the three user-owned types are personal document sets scoped
 * to their owner (`PATIENT` exists for the future patient-document feature
 * and owns nothing yet).
 */
export const DOCUMENT_OWNER_TYPES = ['CLINIC', 'PATIENT', 'DOCTOR', 'ADMIN'] as const;

export const documentOwnerTypeSchema = z.enum(DOCUMENT_OWNER_TYPES);

export type DocumentOwnerTypeValue = z.infer<typeof documentOwnerTypeSchema>;

/**
 * What a document is for. Only the two knowledge-base purposes are ingested
 * into chunks; `GENERAL` is stored and served but never embedded, which is
 * how the future document features share this table without joining the
 * retrieval corpus by accident.
 */
export const DOCUMENT_PURPOSES = [
  'FAQ_KNOWLEDGE_BASE',
  'PERSONAL_KNOWLEDGE_BASE',
  'GENERAL',
] as const;

export const documentPurposeSchema = z.enum(DOCUMENT_PURPOSES);

export type DocumentPurposeValue = z.infer<typeof documentPurposeSchema>;

/**
 * The purposes whose documents enter the extract → chunk → embed pipeline.
 * Deriving the resting ingest status from this list rather than from a
 * hand-written branch is what keeps a future purpose from silently defaulting
 * into the retrieval corpus.
 */
export const INGESTIBLE_DOCUMENT_PURPOSES = [
  'FAQ_KNOWLEDGE_BASE',
  'PERSONAL_KNOWLEDGE_BASE',
] as const satisfies readonly DocumentPurposeValue[];

/**
 * Where a document is in the ingestion pipeline. `NOT_APPLICABLE` is the
 * resting state of a `GENERAL` document and is distinct from `PENDING` on
 * purpose: "nothing will ever ingest this" and "ingestion has not run yet"
 * are different facts, and only one of them is a reason to look at a queue.
 */
export const DOCUMENT_INGEST_STATUSES = [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'NOT_APPLICABLE',
] as const;

export const documentIngestStatusSchema = z.enum(DOCUMENT_INGEST_STATUSES);

export type DocumentIngestStatusValue = z.infer<typeof documentIngestStatusSchema>;

/**
 * Which chat channel may retrieve a clinic-corpus chunk. A staff-only SOP
 * must never surface in a patient answer, and this column is the enforcement
 * (ai-chatbot-tools.md §5.5). It carries no meaning for a personal knowledge
 * base, where owner scoping already decides everything.
 */
export const DOCUMENT_VISIBILITIES = ['PATIENT', 'DOCTOR', 'BOTH'] as const;

export const documentVisibilitySchema = z.enum(DOCUMENT_VISIBILITIES);

export type DocumentVisibilityValue = z.infer<typeof documentVisibilitySchema>;

/**
 * The language a document is written in. Retrieval is deliberately **not**
 * filtered by it — cross-lingual matching is the entire reason for vectors —
 * but it drives citation display, so a reader knows a translation happened.
 */
export const DOCUMENT_LANGUAGES = ['ID', 'EN'] as const;

export const documentLanguageSchema = z.enum(DOCUMENT_LANGUAGES);

export type DocumentLanguageValue = z.infer<typeof documentLanguageSchema>;

/**
 * The file types the document store accepts. Narrower than the bucket's own
 * MIME allowlist on purpose: object storage is shared with image-bearing
 * features, and a document that cannot be turned into text is a row the
 * ingestion pipeline can only ever fail on.
 */
export const DOCUMENT_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
] as const;

export const documentUploadMimeTypeSchema = z.enum(DOCUMENT_UPLOAD_MIME_TYPES);

export type DocumentUploadMimeTypeValue = z.infer<typeof documentUploadMimeTypeSchema>;

/**
 * The extension appended to a minted object key per accepted MIME type. The
 * key is opaque and server-owned — the extension exists so an operator
 * browsing the bucket can tell a PDF from a note, not to carry the uploader's
 * filename, which would put a patient's name in an object key.
 */
export const DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE: Readonly<
  Record<DocumentUploadMimeTypeValue, string>
> = {
  'application/pdf': 'pdf',
  'text/markdown': 'md',
  'text/plain': 'txt',
};

export const DOCUMENT_TITLE_MAX_LENGTH = 200;

export const DOCUMENT_PAGE_DEFAULT_LIMIT = 20;

export const DOCUMENT_PAGE_MAX_LIMIT = 100;

/**
 * Requests a browser-direct upload URL. Only the two facts that must be
 * validated *before* signing are carried: the declared type and size are
 * checked against the store's limits and then signed into the URL, so a
 * client that changes either header is rejected by the provider rather than
 * silently storing something else.
 *
 * The document's own metadata is deliberately absent — nothing is persisted
 * until the upload is confirmed, so a signed URL nobody uses leaves no row.
 */
export const createClinicDocumentUploadUrlSchema = z.object({
  mimeType: documentUploadMimeTypeSchema,
  sizeBytes: z.coerce.number().int().positive(),
});

export type CreateClinicDocumentUploadUrlInput = z.infer<
  typeof createClinicDocumentUploadUrlSchema
>;

/**
 * Records a completed upload as a clinic-corpus document.
 *
 * `mimeType` and `sizeBytes` are **not** accepted here: they are read back
 * from the stored object, because "the client said it uploaded a 2 MB PDF" is
 * not evidence. `storageKey` must be a key this API minted in the same flow —
 * the storage layer refuses any other shape, so a caller cannot point a row
 * at an arbitrary object in the bucket.
 */
export const confirmClinicDocumentUploadSchema = z.object({
  storageKey: z.string().min(1).max(512),
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
  purpose: documentPurposeSchema,
  visibility: documentVisibilitySchema,
  language: documentLanguageSchema,
});

export type ConfirmClinicDocumentUploadInput = z.infer<typeof confirmClinicDocumentUploadSchema>;

/**
 * Edits a document's metadata. The stored file is immutable — replacing the
 * content means uploading a new document — so only the three fields that
 * describe it are editable.
 *
 * Changing `visibility` or `language` changes what retrieval may return, and
 * chunks carry copies of both; the service discards the chunks on such an
 * edit rather than leaving stale copies searchable.
 */
export const updateClinicDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH).optional(),
    visibility: documentVisibilitySchema.optional(),
    language: documentLanguageSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined || value.visibility !== undefined || value.language !== undefined,
    { message: 'At least one field must be provided' },
  );

export type UpdateClinicDocumentInput = z.infer<typeof updateClinicDocumentSchema>;

export const listClinicDocumentsQuerySchema = z.object({
  purpose: documentPurposeSchema.optional(),
  ingestStatus: documentIngestStatusSchema.optional(),
  visibility: documentVisibilitySchema.optional(),
  language: documentLanguageSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_PAGE_MAX_LIMIT)
    .default(DOCUMENT_PAGE_DEFAULT_LIMIT),
});

export type ListClinicDocumentsQueryInput = z.infer<typeof listClinicDocumentsQuerySchema>;
