import { z } from 'zod';

const MAX_CODE_LENGTH = 32;
const MAX_NAME_LENGTH = 200;
const MAX_UNIT_LENGTH = 32;
const MAX_DECIMALS = 6;
const MAX_CODED_OPTIONS = 20;
/** A century in days, which is a generous ceiling for a paediatric band. */
const MAX_AGE_DAYS = 36_500;
const MAX_NOTES_LENGTH = 1_000;
/** A single request never names this many tests; the ceiling is a typo guard. */
const MAX_ORDER_ENTRIES = 50;
const MAX_PAGE_SIZE = 100;

export const labResultTypeSchema = z.enum(['NUMERIC', 'TEXT', 'CODED']);

export const labSpecimenTypeSchema = z.enum([
  'WHOLE_BLOOD',
  'SERUM',
  'PLASMA',
  'URINE',
  'STOOL',
  'SPUTUM',
  'SWAB',
  'OTHER',
]);

const labTestFieldsSchema = z.object({
  code: z.string().trim().min(1).max(MAX_CODE_LENGTH),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  loincCode: z.string().trim().min(1).max(MAX_CODE_LENGTH).nullable().optional(),
  loincDisplay: z.string().trim().min(1).max(MAX_NAME_LENGTH).nullable().optional(),
  specimenType: labSpecimenTypeSchema,
  resultType: labResultTypeSchema,
  unit: z.string().trim().min(1).max(MAX_UNIT_LENGTH).nullable().optional(),
  decimals: z.number().int().min(0).max(MAX_DECIMALS).optional(),
  codedOptions: z
    .array(z.string().trim().min(1).max(MAX_NAME_LENGTH))
    .max(MAX_CODED_OPTIONS)
    .optional(),
  isActive: z.boolean().optional(),
  serviceTariffId: z.string().uuid().nullable().optional(),
});

/**
 * A NUMERIC test is compared against a range, so it needs a unit; a CODED test
 * is picked from a closed list, so it needs options. Refusing the mismatch at
 * the schema tells the person filling in the form, where the database CHECK
 * would only tell the developer reading the 500.
 */
function refineResultShape(
  payload: {
    resultType?: 'NUMERIC' | 'TEXT' | 'CODED';
    unit?: string | null;
    codedOptions?: string[];
  },
  context: z.RefinementCtx,
): void {
  if (payload.resultType === 'NUMERIC' && !payload.unit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unit'],
      message: 'A numeric test needs a unit',
    });
  }
  if (payload.resultType === 'CODED' && (payload.codedOptions ?? []).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['codedOptions'],
      message: 'A coded test needs at least one option',
    });
  }
}

export const createLabTestSchema = labTestFieldsSchema.superRefine(refineResultShape);

/**
 * Every field optional so a PATCH touches only what it names — but the result
 * shape is still checked whenever `resultType` is among them, because changing
 * a test from TEXT to NUMERIC without a unit would leave the catalog in a
 * state the entry form cannot render.
 */
export const updateLabTestSchema = labTestFieldsSchema
  .partial()
  .superRefine(refineResultShape)
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });

export const labReferenceRangeSchema = z
  .object({
    sex: z.enum(['MALE', 'FEMALE']).nullable().optional(),
    ageMinDays: z.number().int().min(0).max(MAX_AGE_DAYS).nullable().optional(),
    ageMaxDays: z.number().int().min(0).max(MAX_AGE_DAYS).nullable().optional(),
    low: z.number().nullable().optional(),
    high: z.number().nullable().optional(),
    criticalLow: z.number().nullable().optional(),
    criticalHigh: z.number().nullable().optional(),
    textNormal: z.string().trim().min(1).max(MAX_NAME_LENGTH).nullable().optional(),
  })
  .refine(
    (range) =>
      range.ageMinDays === null ||
      range.ageMinDays === undefined ||
      range.ageMaxDays === null ||
      range.ageMaxDays === undefined ||
      range.ageMinDays <= range.ageMaxDays,
    { path: ['ageMaxDays'], message: 'The age band ends before it starts' },
  )
  .refine(
    (range) =>
      range.low === null ||
      range.low === undefined ||
      range.high === null ||
      range.high === undefined ||
      range.low <= range.high,
    { path: ['high'], message: 'The range ends below where it starts' },
  );

/**
 * Ranges are replaced wholesale rather than patched one at a time: the set is
 * what defines "normal" for a test, and editing it row by row leaves windows
 * where two bands overlap or none applies.
 */
export const replaceLabReferenceRangesSchema = z.object({
  ranges: z.array(labReferenceRangeSchema).max(50),
});

const labPanelFieldsSchema = z.object({
  code: z.string().trim().min(1).max(MAX_CODE_LENGTH),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  isActive: z.boolean().optional(),
  serviceTariffId: z.string().uuid().nullable().optional(),
  /** Member order is the order the tests print on the report. */
  labTestIds: z.array(z.string().uuid()).min(1).max(50),
});

export const createLabPanelSchema = labPanelFieldsSchema;

export const updateLabPanelSchema = labPanelFieldsSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });

export const listLabTestsQuerySchema = z.object({
  search: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  active: z.coerce.boolean().optional(),
});

export const listLabPanelsQuerySchema = listLabTestsQuerySchema;

export type LabResultTypeValue = z.infer<typeof labResultTypeSchema>;
export type LabSpecimenTypeValue = z.infer<typeof labSpecimenTypeSchema>;
export type CreateLabTestInput = z.infer<typeof createLabTestSchema>;
export type UpdateLabTestInput = z.infer<typeof updateLabTestSchema>;
export type LabReferenceRangeInput = z.infer<typeof labReferenceRangeSchema>;
export type ReplaceLabReferenceRangesInput = z.infer<typeof replaceLabReferenceRangesSchema>;
export type CreateLabPanelInput = z.infer<typeof createLabPanelSchema>;
export type UpdateLabPanelInput = z.infer<typeof updateLabPanelSchema>;
export type ListLabTestsQuery = z.infer<typeof listLabTestsQuerySchema>;
export type ListLabPanelsQuery = z.infer<typeof listLabPanelsQuerySchema>;

export const labOrderStatusSchema = z.enum([
  'ORDERED',
  'COLLECTED',
  'IN_PROGRESS',
  'RESULTED',
  'RELEASED',
  'CANCELLED',
]);

export const labOrderItemStatusSchema = z.enum(['PENDING', 'RESULTED', 'CANCELLED']);

export const labOrderPrioritySchema = z.enum(['ROUTINE', 'URGENT']);

/**
 * What the doctor asks for. Tests and panels arrive as two lists and are
 * merged into one flat set of items server-side — a panel is expanded at order
 * time, so ordering "darah rutin plus GDS" is one request, not two.
 *
 * Both lists may be given and either may be empty, but not both: an order with
 * nothing on it is a mistake the form should catch, not a row to write.
 */
export const createLabOrderSchema = z
  .object({
    testIds: z.array(z.string().uuid()).max(MAX_ORDER_ENTRIES).optional(),
    panelIds: z.array(z.string().uuid()).max(MAX_ORDER_ENTRIES).optional(),
    priority: labOrderPrioritySchema.optional(),
    clinicalNotes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
    isFasting: z.boolean().optional(),
  })
  .refine((payload) => (payload.testIds ?? []).length + (payload.panelIds ?? []).length > 0, {
    path: ['testIds'],
    message: 'An order needs at least one test or panel',
  });

/**
 * Cancelling is the only way an order is withdrawn, and the reason is
 * mandatory: it is what a later "why was my test never run" is answered from.
 */
export const cancelLabOrderSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_NOTES_LENGTH),
});

export const listLabOrdersQuerySchema = z.object({
  status: labOrderStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export const labSpecimenStatusSchema = z.enum(['COLLECTED', 'RECEIVED', 'REJECTED']);

export const labSpecimenRejectReasonSchema = z.enum([
  'HEMOLYSED',
  'INSUFFICIENT',
  'CLOTTED',
  'MISLABELLED',
  'CONTAMINATED',
  'OTHER',
]);

/**
 * Collection names no tubes: the server derives one specimen per distinct
 * specimen type among the order's still-pending items, because that is what
 * actually happens at the chair — one EDTA tube serves the whole darah rutin.
 * `collectedAt` is optional so a draw recorded a few minutes late records when
 * it happened rather than when it was typed.
 */
export const collectLabSpecimensSchema = z.object({
  collectedAt: z.string().datetime().optional(),
  notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
});

export const rejectLabSpecimenSchema = z.object({
  reason: labSpecimenRejectReasonSchema,
  notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
});

/**
 * The four things the bench looks at, in the order a working day goes through
 * them. Buckets rather than raw statuses because "to-validate" is a question
 * about the order (results are in, nobody has signed them out) and not a
 * column anybody would guess.
 */
export const labWorklistBucketSchema = z.enum([
  'to-collect',
  'in-progress',
  'to-validate',
  'released',
]);

export const labWorklistQuerySchema = z.object({
  bucket: labWorklistBucketSchema,
  date: z.string().date().optional(),
});

export type LabOrderStatusValue = z.infer<typeof labOrderStatusSchema>;
export type LabOrderItemStatusValue = z.infer<typeof labOrderItemStatusSchema>;
export type LabOrderPriorityValue = z.infer<typeof labOrderPrioritySchema>;
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;
export type CancelLabOrderInput = z.infer<typeof cancelLabOrderSchema>;
export type ListLabOrdersQuery = z.infer<typeof listLabOrdersQuerySchema>;
export type LabSpecimenStatusValue = z.infer<typeof labSpecimenStatusSchema>;
export type LabSpecimenRejectReasonValue = z.infer<typeof labSpecimenRejectReasonSchema>;
export type CollectLabSpecimensInput = z.infer<typeof collectLabSpecimensSchema>;
export type RejectLabSpecimenInput = z.infer<typeof rejectLabSpecimenSchema>;
export type LabWorklistBucketValue = z.infer<typeof labWorklistBucketSchema>;
export type LabWorklistQuery = z.infer<typeof labWorklistQuerySchema>;
