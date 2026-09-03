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
  'PATIENT_CLINICAL',
  'DOCTOR_VAULT',
  'GENERAL',
] as const;

export const documentPurposeSchema = z.enum(DOCUMENT_PURPOSES);

export type DocumentPurposeValue = z.infer<typeof documentPurposeSchema>;

/**
 * The purposes whose documents enter the extract → chunk → embed pipeline.
 * Deriving the resting ingest status from this list rather than from a
 * hand-written branch is what keeps a future purpose from silently defaulting
 * into the retrieval corpus.
 *
 * `PATIENT_CLINICAL` (P16-T07) is deliberately absent: a lab result is a
 * medical record, not chatbot knowledge, and its resting ingest status is
 * `NOT_APPLICABLE` precisely because this list does not contain it.
 *
 * `DOCTOR_VAULT` (P16-T16) is absent for a sharper reason. A vault holds a
 * doctor's KTP, their NPWP, their contracts; ingesting one would send those
 * pages to an embedding provider and put them in a retrieval corpus. That the
 * vault sits one enum value away from `PERSONAL_KNOWLEDGE_BASE`, whose entire
 * job *is* to reach the provider, is why this list is an allowlist — a new
 * purpose stays out of the pipeline unless someone names it here.
 */
export const INGESTIBLE_DOCUMENT_PURPOSES = [
  'FAQ_KNOWLEDGE_BASE',
  'PERSONAL_KNOWLEDGE_BASE',
] as const satisfies readonly DocumentPurposeValue[];

/**
 * The purposes the corpus upload surfaces may name (P16-T07). Exactly the
 * pre-`PATIENT_CLINICAL` set: a clinical file is created through the patient
 * document API (`P16-T08`) with its purpose stated server-side, never through
 * the clinic-corpus confirm — a `PATIENT_CLINICAL` row without a patient
 * would only die on the migration's CHECK, and the API refuses it here with
 * a readable 400 instead.
 *
 * `DOCTOR_VAULT` (P16-T16) is absent on the same grounds: a vault document is
 * created through the vault API (`P16-T17`) with its purpose stated
 * server-side. If the corpus confirm accepted it, a doctor could file a
 * personal document into their knowledge base by naming a purpose — and the
 * one thing this feature must never do is blur those two.
 */
export const CORPUS_DOCUMENT_PURPOSES = [
  'FAQ_KNOWLEDGE_BASE',
  'PERSONAL_KNOWLEDGE_BASE',
  'GENERAL',
] as const satisfies readonly DocumentPurposeValue[];

export const corpusDocumentPurposeSchema = z.enum(CORPUS_DOCUMENT_PURPOSES);

export type CorpusDocumentPurposeValue = z.infer<typeof corpusDocumentPurposeSchema>;

/**
 * What kind of clinical file a `PATIENT_CLINICAL` document is (P16-T07).
 * A closed set because the patient tab filters by it.
 */
export const DOCUMENT_CATEGORIES = [
  'LAB_RESULT',
  'RADIOLOGY',
  'EXTERNAL_MEDICAL_RECORD',
  'REFERRAL_LETTER',
  'CONSENT_FORM',
  'DISCHARGE_SUMMARY',
  'MEDICAL_CERTIFICATE',
  'INSURANCE',
  'IDENTITY',
  'OTHER',
] as const;

export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);

export type DocumentCategoryValue = z.infer<typeof documentCategorySchema>;

/**
 * How a doctor files their own paperwork (P16-T16, §7.3.3): STR/SIP, ijazah
 * and specialist certificates, Serkom and the IDI recommendation, CME/P2KB,
 * indemnity insurance, contracts and SK, KTP/NPWP, a CV.
 *
 * Distinct from {@link DOCUMENT_CATEGORIES}, which classifies a *patient's*
 * clinical file. Nothing reviews these values and no completeness check runs
 * against them — the vault has no audience but its owner, so this list is a
 * filing aid and not a checklist anyone is measured on.
 */
export const VAULT_DOCUMENT_CATEGORIES = [
  'REGISTRATION_LICENCE',
  'EDUCATION',
  'COMPETENCE',
  'CONTINUING_EDUCATION',
  'INSURANCE',
  'EMPLOYMENT',
  'IDENTITY_TAX',
  'CURRICULUM_VITAE',
  'PERSONAL_REFERENCE',
  'OTHER',
] as const;

export const vaultDocumentCategorySchema = z.enum(VAULT_DOCUMENT_CATEGORIES);

export type VaultDocumentCategoryValue = z.infer<typeof vaultDocumentCategorySchema>;

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
  purpose: corpusDocumentPurposeSchema,
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
  purpose: corpusDocumentPurposeSchema.optional(),
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

const patientDocumentDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

export const PATIENT_DOCUMENT_NOTES_MAX_LENGTH = 2000;

export const PATIENT_DOCUMENT_DELETE_REASON_MAX_LENGTH = 500;

/**
 * Signs one browser-direct upload of a patient clinical file (`P16-T08`).
 * Same two facts as every other upload surface: type and size are validated
 * before signing and then signed into the URL. The patient is named by the
 * route, never the body, and nothing is persisted until confirm.
 */
export const createPatientDocumentUploadUrlSchema = z.object({
  mimeType: documentUploadMimeTypeSchema,
  sizeBytes: z.coerce.number().int().positive().max(DOCUMENT_MAX_UPLOAD_SIZE_BYTES),
});

export type CreatePatientDocumentUploadUrlInput = z.infer<
  typeof createPatientDocumentUploadUrlSchema
>;

/**
 * Records a completed upload as one patient clinical file (`P16-T08`).
 *
 * `purpose`, `ownerType`, and `ingestStatus` are never accepted — the
 * repository states them (`PATIENT_CLINICAL`, `PATIENT`-owned, never
 * ingested). `mimeType` and `sizeBytes` are read back from the stored object.
 * At most one care episode may be named: a document arose from a visit or an
 * admission, not both, and the migration CHECK enforces the same rule below
 * the API.
 */
export const confirmPatientDocumentUploadSchema = z
  .object({
    storageKey: z.string().min(1).max(512),
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
    category: documentCategorySchema,
    documentDate: patientDocumentDateSchema.optional(),
    notes: z.string().trim().min(1).max(PATIENT_DOCUMENT_NOTES_MAX_LENGTH).optional(),
    encounterId: z.string().uuid().optional(),
    admissionId: z.string().uuid().optional(),
    language: documentLanguageSchema.default('ID'),
  })
  .refine((value) => value.encounterId === undefined || value.admissionId === undefined, {
    message: 'A document may be linked to an encounter or an admission, not both',
  });

export type ConfirmPatientDocumentUploadInput = z.infer<typeof confirmPatientDocumentUploadSchema>;

/**
 * Edits a clinical file's metadata, or moves its care-episode link. The
 * stored file is immutable — a wrong scan is deleted (with a reason) and
 * re-uploaded, never replaced in place. `null` unlinks an episode, which is
 * the documented remedy when a linked encounter must be retired: `Restrict`
 * on the FK refuses the encounter delete until the document lets go.
 */
export const updatePatientDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH).optional(),
    category: documentCategorySchema.optional(),
    documentDate: patientDocumentDateSchema.nullable().optional(),
    notes: z.string().trim().min(1).max(PATIENT_DOCUMENT_NOTES_MAX_LENGTH).nullable().optional(),
    encounterId: z.string().uuid().nullable().optional(),
    admissionId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided',
  })
  .refine(
    (value) =>
      value.encounterId === undefined ||
      value.admissionId === undefined ||
      value.encounterId === null ||
      value.admissionId === null,
    { message: 'A document may be linked to an encounter or an admission, not both' },
  );

export type UpdatePatientDocumentInput = z.infer<typeof updatePatientDocumentSchema>;

/**
 * Lists one patient's clinical files, newest-first by document date
 * (FR-E2-04). The patient is named by the route; the filters narrow, never
 * widen.
 */
export const listPatientDocumentsQuerySchema = z.object({
  category: documentCategorySchema.optional(),
  encounterId: z.string().uuid().optional(),
  admissionId: z.string().uuid().optional(),
  documentDateFrom: patientDocumentDateSchema.optional(),
  documentDateTo: patientDocumentDateSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_PAGE_MAX_LIMIT)
    .default(DOCUMENT_PAGE_DEFAULT_LIMIT),
});

export type ListPatientDocumentsQueryInput = z.infer<typeof listPatientDocumentsQuerySchema>;

/**
 * Retires one clinical file (FR-E2-11). The reason is required — clinical
 * files sit under the 25-year RME retention floor, so every removal must say
 * why — and the delete is soft: the row is retired, the stored object stays.
 */
export const deletePatientDocumentSchema = z.object({
  reason: z.string().trim().min(1).max(PATIENT_DOCUMENT_DELETE_REASON_MAX_LENGTH),
});

export type DeletePatientDocumentInput = z.infer<typeof deletePatientDocumentSchema>;

/** Lists the caller's own released documents in the patient portal. */
export const listPortalDocumentsQuerySchema = z.object({
  category: documentCategorySchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_PAGE_MAX_LIMIT)
    .default(DOCUMENT_PAGE_DEFAULT_LIMIT),
});

export type ListPortalDocumentsQueryInput = z.infer<typeof listPortalDocumentsQuerySchema>;

export const VAULT_DOCUMENT_REFERENCE_NUMBER_MAX_LENGTH = 120;

const vaultDocumentDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

/**
 * Signs one browser-direct upload into the caller's **own** vault
 * (`P16-T17`).
 *
 * Kept separate from the knowledge-base equivalent for the reason that runs
 * through this whole feature: the two mint keys under different prefixes, and
 * a knowledge-base document's passages are sent to the AI provider while a
 * vault document's never leave the bucket. One schema serving both would make
 * that difference a runtime argument rather than a route.
 */
export const createVaultDocumentUploadUrlSchema = z.object({
  mimeType: documentUploadMimeTypeSchema,
  sizeBytes: z.coerce.number().int().positive().max(DOCUMENT_MAX_UPLOAD_SIZE_BYTES),
});

export type CreateVaultDocumentUploadUrlInput = z.infer<typeof createVaultDocumentUploadUrlSchema>;

/**
 * Records a completed upload as a document in the caller's own vault.
 *
 * Neither `purpose`, `ownerType` nor `ownerId` is accepted — all three are
 * derived from the authenticated actor (FR-E3-02). That is the structural half
 * of this feature's privacy: there is no request shape that names another
 * person's vault, so there is nothing for a permission to have to refuse.
 *
 * The filing fields are the owner's own notes to themselves. Nothing validates
 * a reference number against an external register, and nothing checks that a
 * category matches what the file actually contains.
 */
export const confirmVaultDocumentUploadSchema = z.object({
  storageKey: z.string().min(1).max(512),
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
  language: documentLanguageSchema,
  vaultCategory: vaultDocumentCategorySchema.optional(),
  referenceNumber: z
    .string()
    .trim()
    .min(1)
    .max(VAULT_DOCUMENT_REFERENCE_NUMBER_MAX_LENGTH)
    .optional(),
  issuedAt: vaultDocumentDateSchema.optional(),
  expiresAt: vaultDocumentDateSchema.optional(),
});

export type ConfirmVaultDocumentUploadInput = z.infer<typeof confirmVaultDocumentUploadSchema>;

/**
 * Edits a vault document's filing metadata (FR-E3-01). The stored file is
 * immutable; only the owner's notes about it change.
 *
 * Every field is nullable as well as optional, because clearing a date the
 * owner entered by mistake has to be expressible — an optional-only schema
 * makes "unset this" indistinguishable from "leave it alone".
 */
export const updateVaultDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH).optional(),
    vaultCategory: vaultDocumentCategorySchema.nullable().optional(),
    referenceNumber: z
      .string()
      .trim()
      .min(1)
      .max(VAULT_DOCUMENT_REFERENCE_NUMBER_MAX_LENGTH)
      .nullable()
      .optional(),
    issuedAt: vaultDocumentDateSchema.nullable().optional(),
    expiresAt: vaultDocumentDateSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateVaultDocumentInput = z.infer<typeof updateVaultDocumentSchema>;

/**
 * Lists the caller's own vault. There is no owner filter and no `purpose`
 * filter: this route addresses exactly one vault, and offering either field
 * would imply it could address another.
 */
export const listVaultDocumentsQuerySchema = z.object({
  vaultCategory: vaultDocumentCategorySchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_PAGE_MAX_LIMIT)
    .default(DOCUMENT_PAGE_DEFAULT_LIMIT),
});

export type ListVaultDocumentsQueryInput = z.infer<typeof listVaultDocumentsQuerySchema>;
