import { z } from 'zod';

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
