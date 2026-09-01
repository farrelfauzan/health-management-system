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
 * The types the ingestion pipeline can turn into text. Every one of these has
 * an extractor in `extract-document-text.ts`, and that is the property the
 * list actually encodes — a type added here without one becomes a row the
 * pipeline can only ever fail on.
 */
export const DOCUMENT_TEXT_MIME_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
] as const;

/**
 * The image types the document store accepts (`P16-T03`). Scans get
 * photographed — a referral letter arrives as a phone picture far more often
 * than as a PDF — so refusing images means refusing the documents clinics
 * actually have.
 *
 * They are stored, never ingested: HMS runs no OCR, so an image carries no
 * text for retrieval to find. `SVG` is deliberately absent, here as
 * everywhere: it is a document format with script and external-reference
 * semantics wearing an `image/` prefix.
 *
 * Accepting these is only safe because of what happens at confirm — every
 * image is decoded and re-encoded before it is kept
 * (`docs/security/file-uploads.md` §1). Widening this list without that step
 * is the change that rule exists to forbid.
 */
export const DOCUMENT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * The file types the document store accepts. Still narrower than the bucket's
 * own MIME allowlist, which is the union across every upload surface.
 */
export const DOCUMENT_UPLOAD_MIME_TYPES = [
  ...DOCUMENT_TEXT_MIME_TYPES,
  ...DOCUMENT_IMAGE_MIME_TYPES,
] as const;

export const documentUploadMimeTypeSchema = z.enum(DOCUMENT_UPLOAD_MIME_TYPES);

export type DocumentUploadMimeTypeValue = z.infer<typeof documentUploadMimeTypeSchema>;

export type DocumentImageMimeTypeValue = (typeof DOCUMENT_IMAGE_MIME_TYPES)[number];

/**
 * Whether a stored document is an image — the one question that decides both
 * whether the bytes get re-encoded at confirm and whether the ingestion
 * pipeline should ever look at the row.
 *
 * Takes a plain `string` rather than the accepted-type union because the
 * caller that matters most reads it back off a database column, where it is
 * whatever was stored. Narrowing here is the point.
 */
export function isDocumentImageMimeType(mimeType: string): mimeType is DocumentImageMimeTypeValue {
  return DOCUMENT_IMAGE_MIME_TYPES.some((imageMimeType) => imageMimeType === mimeType);
}

/**
 * 20 MiB, four times the bucket's old default. A scanned multi-page radiology
 * report does not fit in 5 MiB, and a clinic that has to compress a scan
 * before uploading it will instead photograph the screen.
 *
 * This is the document store's own cap, not the bucket's. Each surface
 * declares one next to its schemas and the bucket ceiling stays above them
 * all — a surface can narrow what storage accepts, never widen it.
 */
export const DOCUMENT_MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

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
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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
  sizeBytes: z.coerce.number().int().positive().max(DOCUMENT_MAX_UPLOAD_SIZE_BYTES),
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

/**
 * Signs one browser-direct upload into the caller's **own** knowledge base
 * (`P15-T20`).
 *
 * Identical in shape to the clinic equivalent and deliberately kept separate:
 * these two flows mint keys under different prefixes and are reachable with
 * different permission scopes, so one schema serving both would make the
 * difference between them a runtime argument rather than a route.
 */
export const createPersonalDocumentUploadUrlSchema = z.object({
  mimeType: documentUploadMimeTypeSchema,
  sizeBytes: z.coerce.number().int().positive().max(DOCUMENT_MAX_UPLOAD_SIZE_BYTES),
});

export type CreatePersonalDocumentUploadUrlInput = z.infer<
  typeof createPersonalDocumentUploadUrlSchema
>;

/**
 * Records a completed upload as a document in the caller's own knowledge base.
 *
 * Neither `purpose`, `ownerType` nor `ownerId` is accepted. All three are
 * derived from the authenticated actor, because a personal corpus that let its
 * owner be named in a request body would be a clinic-corpus write with extra
 * steps — and `purpose` is what the public channel's retrieval filter keys on
 * (`ownerType = CLINIC` + `purpose = FAQ_KNOWLEDGE_BASE`), so a caller able to
 * set it could publish into the channel patients read.
 *
 * `visibility` is absent for the same reason it would be meaningless: a
 * personal document is retrieved only in its owner's own sessions, never by
 * channel.
 */
export const confirmPersonalDocumentUploadSchema = z.object({
  storageKey: z.string().min(1).max(512),
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
  language: documentLanguageSchema,
});

export type ConfirmPersonalDocumentUploadInput = z.infer<
  typeof confirmPersonalDocumentUploadSchema
>;

/**
 * Edits a personal document's metadata. The stored file is immutable, and
 * `language` is copied onto chunks, so the service discards chunks when it
 * changes rather than leaving stale copies searchable.
 */
export const updatePersonalDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH).optional(),
    language: documentLanguageSchema.optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.language !== undefined,
    { message: 'At least one field must be provided' },
  );

export type UpdatePersonalDocumentInput = z.infer<typeof updatePersonalDocumentSchema>;

/**
 * Lists the caller's own knowledge base. There is no `purpose` filter: this
 * corpus has exactly one purpose, and offering the field would imply the route
 * could return something else.
 */
export const listPersonalDocumentsQuerySchema = z.object({
  ingestStatus: documentIngestStatusSchema.optional(),
  language: documentLanguageSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_PAGE_MAX_LIMIT)
    .default(DOCUMENT_PAGE_DEFAULT_LIMIT),
});

export type ListPersonalDocumentsQueryInput = z.infer<typeof listPersonalDocumentsQuerySchema>;
