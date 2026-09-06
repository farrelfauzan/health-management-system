import { z } from 'zod';

import {
  DOCUMENT_MAX_UPLOAD_SIZE_BYTES,
  documentUploadMimeTypeSchema,
} from '#document-management/schemas';

/**
 * What a document type's issue step does (`P16-T39`, §7.5.2.1). Mirrors the
 * Prisma `DocumentTypeBehavior` enum. Bounded even though types are
 * unbounded: a clinic can invent a type, it cannot invent a handler, so a
 * clinic-created type is always `GENERIC` and **no request schema in this
 * file accepts the field** (FR-E5-32).
 */
export const DOCUMENT_TYPE_BEHAVIORS = [
  'GENERIC',
  'INVOICE_TEMPLATE',
  'CLINIC_CORPUS',
  'PATIENT_BILL',
] as const;

export const documentTypeBehaviorSchema = z.enum(DOCUMENT_TYPE_BEHAVIORS);

export type DocumentTypeBehaviorValue = z.infer<typeof documentTypeBehaviorSchema>;

export const DEFAULT_DOCUMENT_TYPE_BEHAVIOR: DocumentTypeBehaviorValue = 'GENERIC';

/**
 * Whether a document of a type is drafted in the editor, uploaded as a file,
 * or either (FR-E5-35). Mirrors the Prisma `DocumentContentMode` enum.
 */
export const DOCUMENT_CONTENT_MODES = ['DRAFTED', 'UPLOADED', 'EITHER'] as const;

export const documentContentModeSchema = z.enum(DOCUMENT_CONTENT_MODES);

export type DocumentContentModeValue = z.infer<typeof documentContentModeSchema>;

/**
 * The `code` values `seed.sql` owns (§7.5.2.3). Handlers key on these and
 * never on `name`, which is why renaming a system type is free (FR-E5-37).
 */
export const SYSTEM_DOCUMENT_TYPE_CODES = [
  'AGREEMENT_PATIENT_CLINIC',
  'AGREEMENT_PATIENT_DOCTOR',
  'CONSENT_FORM',
  'CLINIC_POLICY_SOP',
  'LETTER',
  'INVOICE_TEMPLATE',
  'CLINIC_CORPUS_DOCUMENT',
  'PATIENT_BILL',
  'OTHER',
] as const;

export type SystemDocumentTypeCode = (typeof SYSTEM_DOCUMENT_TYPE_CODES)[number];

export const MAX_DOCUMENT_TYPE_NAME_LENGTH = 120;

export const MAX_DOCUMENT_TYPE_DESCRIPTION_LENGTH = 500;

/**
 * Two signatures is the most a document should ever need (FR-E5-24 is a
 * COULD); a cap keeps a typo from creating a type nothing can ever issue.
 */
export const MAX_DOCUMENT_TYPE_REQUIRED_APPROVALS = 5;

export const MAX_DOCUMENT_TYPE_DEFAULT_APPROVERS = 10;

/** The shape of a `code`: upper snake case, as the seeded ones are. */
export const DOCUMENT_TYPE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

const documentTypeNameSchema = z.string().trim().min(1).max(MAX_DOCUMENT_TYPE_NAME_LENGTH);

const documentTypeDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_DOCUMENT_TYPE_DESCRIPTION_LENGTH);

const requiredApprovalsSchema = z.number().int().min(1).max(MAX_DOCUMENT_TYPE_REQUIRED_APPROVALS);

const sortOrderSchema = z.number().int().min(0);

/**
 * Create a clinic type (FR-E5-31).
 *
 * **Strict**, so a request carrying `behavior` — or `code`, or `isSystem` —
 * is rejected as a validation error rather than silently stripped
 * (§7.5.10). The service sets `behavior = GENERIC` and generates `code` from
 * the name; neither is the client's to choose.
 */
export const createDocumentTypeSchema = z
  .object({
    name: documentTypeNameSchema,
    description: documentTypeDescriptionSchema.optional(),
    isApprovalRequired: z.boolean().default(false),
    allowSelfApproval: z.boolean().default(false),
    requiredApprovals: requiredApprovalsSchema.default(1),
    requiresPatient: z.boolean().default(false),
    requiresDoctor: z.boolean().default(false),
    contentMode: documentContentModeSchema.default('EITHER'),
    isActive: z.boolean().default(true),
    sortOrder: sortOrderSchema.default(0),
  })
  .strict();

export type CreateDocumentTypeInput = z.infer<typeof createDocumentTypeSchema>;

/**
 * Edit a type. `code` is accepted here so a clinic may re-key its *own* types
 * before anything depends on them; the service refuses it on a system row
 * (FR-E5-33). `behavior` is not accepted on any row.
 */
export const updateDocumentTypeSchema = z
  .object({
    code: z.string().trim().regex(DOCUMENT_TYPE_CODE_PATTERN).optional(),
    name: documentTypeNameSchema.optional(),
    description: documentTypeDescriptionSchema.nullable().optional(),
    isApprovalRequired: z.boolean().optional(),
    allowSelfApproval: z.boolean().optional(),
    requiredApprovals: requiredApprovalsSchema.optional(),
    requiresPatient: z.boolean().optional(),
    requiresDoctor: z.boolean().optional(),
    contentMode: documentContentModeSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateDocumentTypeInput = z.infer<typeof updateDocumentTypeSchema>;

/** The whole default-approver set, replaced in one PUT (FR-E5-38). */
export const setDocumentTypeDefaultApproversSchema = z
  .object({
    approverIds: z
      .array(z.string().uuid())
      .max(MAX_DOCUMENT_TYPE_DEFAULT_APPROVERS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Each approver may appear once',
      }),
  })
  .strict();

export type SetDocumentTypeDefaultApproversInput = z.infer<
  typeof setDocumentTypeDefaultApproversSchema
>;

/**
 * The settings screen wants every row; the new-document picker wants live
 * ones only. Defaults to live, so a caller that forgets never offers a
 * deactivated type (FR-E5-36).
 */
export const listDocumentTypesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListDocumentTypesQueryInput = z.infer<typeof listDocumentTypesQuerySchema>;

/**
 * Deleting a type that documents point at is refused with this code; the
 * response names the count and the UI offers deactivation (FR-E5-36).
 */
export const DOCUMENT_TYPE_IN_USE_ERROR_CODE = 'DOCUMENT_TYPE_IN_USE';

export const DOCUMENT_TYPE_SYSTEM_ROW_ERROR_CODE = 'DOCUMENT_TYPE_SYSTEM_ROW';

export const documentTypeInUseDetailsSchema = z.object({
  documentCount: z.number().int().min(1),
});

export type DocumentTypeInUseDetails = z.infer<typeof documentTypeInUseDetailsSchema>;

/**
 * Where a managed document is in its life (`P16-T28`). Mirrors the Prisma
 * `ManagedDocumentStatus` enum.
 */
export const MANAGED_DOCUMENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'ISSUED',
  'ARCHIVED',
] as const;

export const managedDocumentStatusSchema = z.enum(MANAGED_DOCUMENT_STATUSES);

export type ManagedDocumentStatusValue = z.infer<typeof managedDocumentStatusSchema>;

export const MAX_MANAGED_DOCUMENT_TITLE_LENGTH = 200;

export const MAX_MANAGED_DOCUMENT_NUMBER_LENGTH = 80;

/**
 * 500k characters of drafted HTML — an order of magnitude above any real
 * agreement, and small enough that the sanitiser never chews through
 * megabytes pasted in by mistake.
 */
export const MAX_MANAGED_DOCUMENT_CONTENT_HTML_LENGTH = 500_000;

const MAX_STORAGE_KEY_LENGTH = 512;

const managedDocumentTitleSchema = z.string().trim().min(1).max(MAX_MANAGED_DOCUMENT_TITLE_LENGTH);

const managedDocumentNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_MANAGED_DOCUMENT_NUMBER_LENGTH);

const managedDocumentContentHtmlSchema = z.string().max(MAX_MANAGED_DOCUMENT_CONTENT_HTML_LENGTH);

const managedDocumentStorageKeySchema = z.string().min(1).max(MAX_STORAGE_KEY_LENGTH);

function hasAtMostOneContent(input: {
  contentHtml?: string | null;
  storageKey?: string | null;
}): boolean {
  const hasHtml = input.contentHtml !== undefined && input.contentHtml !== null;
  const hasKey = input.storageKey !== undefined && input.storageKey !== null;
  return !(hasHtml && hasKey);
}

/**
 * Draft a registry document (`P16-T28`, FR-E5-01). A document is drafted or
 * uploaded, never both — the refinement mirrors the database CHECK so the
 * refusal is a 400 with a field name rather than a 500 from Postgres.
 *
 * **Strict**: `status`, `issuedAt`, the `subject*` links and `draftedById`
 * are the service's. A `PATIENT_BILL` row is created by E1 at invoice
 * issue, never by a request, and the subject links are what the per-row
 * access rule reads (FR-E5-04) — a client that could set one could point a
 * plain row at somebody's vault document and read it through the registry.
 *
 * Party requirements (`requiresPatient` / `requiresDoctor`) and content
 * modes are enforced against the type row server-side (`P16-T36`).
 */
export const createManagedDocumentSchema = z
  .object({
    typeId: z.string().uuid(),
    title: managedDocumentTitleSchema,
    documentNumber: managedDocumentNumberSchema.optional(),
    contentHtml: managedDocumentContentHtmlSchema.optional(),
    storageKey: managedDocumentStorageKeySchema.optional(),
    patientId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional(),
  })
  .strict()
  .refine(hasAtMostOneContent, {
    message: 'A document is drafted or uploaded, never both',
    path: ['storageKey'],
  });

export type CreateManagedDocumentInput = z.infer<typeof createManagedDocumentSchema>;

/**
 * Edit a draft. `null` clears an optional field; switching from drafted to
 * uploaded means clearing one and setting the other in the same request.
 */
export const updateManagedDocumentSchema = z
  .object({
    title: managedDocumentTitleSchema.optional(),
    documentNumber: managedDocumentNumberSchema.nullable().optional(),
    contentHtml: managedDocumentContentHtmlSchema.nullable().optional(),
    storageKey: managedDocumentStorageKeySchema.nullable().optional(),
    patientId: z.string().uuid().nullable().optional(),
    doctorId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  })
  .refine(hasAtMostOneContent, {
    message: 'A document is drafted or uploaded, never both',
    path: ['storageKey'],
  });

export type UpdateManagedDocumentInput = z.infer<typeof updateManagedDocumentSchema>;

export const MANAGED_DOCUMENT_DATE_FIELDS = ['created', 'issued'] as const;

export const managedDocumentDateFieldSchema = z.enum(MANAGED_DOCUMENT_DATE_FIELDS);

export type ManagedDocumentDateFieldValue = z.infer<typeof managedDocumentDateFieldSchema>;

const MAX_MANAGED_DOCUMENT_SEARCH_LENGTH = 120;

const MANAGED_DOCUMENT_PAGE_MAX_LIMIT = 100;

const MANAGED_DOCUMENT_PAGE_DEFAULT_LIMIT = 25;

/**
 * The registry's filters (FR-E5-02/03): type, status, drafter, approver, a
 * date range on created or issued, and a search over title, document number
 * and party names. `approver` is accepted now and matched once `P16-T29`
 * lands the approval rounds — until then it narrows to nothing rather than
 * being ignored, so a saved filter never silently widens.
 */
export const listManagedDocumentsQuerySchema = z.object({
  typeId: z.string().uuid().optional(),
  status: managedDocumentStatusSchema.optional(),
  draftedBy: z.string().uuid().optional(),
  approver: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  dateField: managedDocumentDateFieldSchema.default('created'),
  q: z.string().trim().min(1).max(MAX_MANAGED_DOCUMENT_SEARCH_LENGTH).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MANAGED_DOCUMENT_PAGE_MAX_LIMIT)
    .default(MANAGED_DOCUMENT_PAGE_DEFAULT_LIMIT),
});

export type ListManagedDocumentsQueryInput = z.infer<typeof listManagedDocumentsQuerySchema>;

/** The CSV export takes the same filters and no page (FR-E5-07). */
export const exportManagedDocumentsQuerySchema = listManagedDocumentsQuerySchema.omit({
  page: true,
  limit: true,
});

export type ExportManagedDocumentsQueryInput = z.infer<typeof exportManagedDocumentsQuerySchema>;

/** How many rows one export may carry — a survey, not a dump. */
export const MANAGED_DOCUMENT_EXPORT_MAX_ROWS = 5_000;

export const MANAGED_DOCUMENT_CONTENT_CONFLICT_ERROR_CODE = 'MANAGED_DOCUMENT_CONTENT_CONFLICT';

export const MANAGED_DOCUMENT_NOT_EDITABLE_ERROR_CODE = 'MANAGED_DOCUMENT_NOT_EDITABLE';

/**
 * A document that breaks its type's party or content rules (`P16-T36`,
 * FR-E5-35) is refused with this code; `error.details.issues` lists each
 * broken rule with the field it belongs to.
 */
export const MANAGED_DOCUMENT_TYPE_RULE_ERROR_CODE = 'MANAGED_DOCUMENT_TYPE_RULE';

/**
 * Sign a browser-direct upload of a registry document's body (`P16-T36`).
 * The same store allowlist and cap as every other upload surface — a signed
 * agreement is a PDF or a photograph of one.
 */
export const createManagedDocumentUploadUrlSchema = z
  .object({
    mimeType: documentUploadMimeTypeSchema,
    sizeBytes: z.coerce.number().int().positive().max(DOCUMENT_MAX_UPLOAD_SIZE_BYTES),
  })
  .strict();

export type CreateManagedDocumentUploadUrlInput = z.infer<
  typeof createManagedDocumentUploadUrlSchema
>;
