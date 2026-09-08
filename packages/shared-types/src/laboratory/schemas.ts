import { z } from 'zod';

import { privacyNoticeEvidenceSchema } from '#patient-management/schemas';

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
const MAX_FACILITY_NAME_LENGTH = 200;

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

/**
 * Where a lab request came from (P18-T10). Only EXTERNAL_REFERRAL carries an
 * outside requester to name.
 */
export const LAB_ORDER_SOURCES = ['ENCOUNTER', 'WALK_IN', 'EXTERNAL_REFERRAL'] as const;

export const labOrderSourceSchema = z.enum(LAB_ORDER_SOURCES);

export type LabOrderSourceValue = z.infer<typeof labOrderSourceSchema>;

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

/**
 * Where a clinical request is filled and who pays for it (P18-T11). Two axes
 * rather than one: a klinik that sends blood to a lab rujukan and bills the
 * patient itself with a markup is EXTERNAL on the first and CLINIC on the
 * second, and one combined flag could not say that.
 */
export const fulfilmentSiteSchema = z.enum(['INTERNAL', 'EXTERNAL']);

export const chargeModeSchema = z.enum(['CLINIC', 'EXTERNAL', 'COVERED']);

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
    /** Defaults to run here and billed here when the doctor says nothing. */
    fulfilmentSite: fulfilmentSiteSchema.optional(),
    chargeMode: chargeModeSchema.optional(),
    externalFacilityName: z.string().trim().min(1).max(MAX_FACILITY_NAME_LENGTH).optional(),
  })
  .refine((payload) => (payload.testIds ?? []).length + (payload.panelIds ?? []).length > 0, {
    path: ['testIds'],
    message: 'An order needs at least one test or panel',
  })
  .refine(
    (payload) => payload.fulfilmentSite !== 'EXTERNAL' || Boolean(payload.externalFacilityName),
    { path: ['externalFacilityName'], message: 'Name the facility the patient was sent to' },
  )
  .refine(
    (payload) => payload.fulfilmentSite === 'EXTERNAL' || !payload.externalFacilityName,
    {
      path: ['externalFacilityName'],
      message: 'Work done here cannot name an outside facility',
    },
  );

/**
 * A request that did not come from a consultation (P18-T10): the front desk
 * opens a LAB_ONLY visit for the patient and orders against it directly.
 *
 * `source` is required rather than inferred, because the difference matters to
 * the report and to the patient: a WALK_IN is the clinic's own check-up panel,
 * an EXTERNAL_REFERRAL was asked for by a doctor who has to be named on the
 * sheet the result goes back on.
 */
export const createWalkInLabOrderSchema = z
  .object({
    patientId: z.string().uuid(),
    source: z.enum(['WALK_IN', 'EXTERNAL_REFERRAL']),
    testIds: z.array(z.string().uuid()).max(MAX_ORDER_ENTRIES).optional(),
    panelIds: z.array(z.string().uuid()).max(MAX_ORDER_ENTRIES).optional(),
    priority: labOrderPrioritySchema.optional(),
    clinicalNotes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
    isFasting: z.boolean().optional(),
    externalRequesterName: z.string().trim().min(1).max(MAX_FACILITY_NAME_LENGTH).optional(),
    externalRequesterFacility: z.string().trim().min(1).max(MAX_FACILITY_NAME_LENGTH).optional(),
    /** The scanned surat pengantar, already filed as the patient's document. */
    requestLetterDocumentId: z.string().uuid().optional(),
    /**
     * Captured here for the same reason the consultation flow captures it: a
     * visit that produces a record needs current consent evidence, and coming
     * in only for a blood draw is not an exemption.
     */
    privacyNotice: privacyNoticeEvidenceSchema.optional(),
  })
  .refine((payload) => (payload.testIds ?? []).length + (payload.panelIds ?? []).length > 0, {
    path: ['testIds'],
    message: 'An order needs at least one test or panel',
  })
  .refine(
    (payload) => payload.source !== 'EXTERNAL_REFERRAL' || Boolean(payload.externalRequesterName),
    {
      path: ['externalRequesterName'],
      message: 'Name the doctor who asked for the test',
    },
  )
  .refine(
    (payload) => payload.source === 'EXTERNAL_REFERRAL' || !payload.externalRequesterName,
    {
      path: ['externalRequesterName'],
      message: 'A walk-in has no outside requester to name',
    },
  );

/**
 * Cancelling is the only way an order is withdrawn, and the reason is
 * mandatory: it is what a later "why was my test never run" is answered from.
 */
export const cancelLabOrderSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_NOTES_LENGTH),
});

export const listLabOrdersQuerySchema = z.object({
  /**
   * The number printed on the surat pengantar (P18-T13). The analis is holding
   * paper and has to pull that one order up; without this they scan the
   * to-collect bucket by eye, which stops working at about forty a morning.
   */
  orderNumber: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
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
export type CreateWalkInLabOrderInput = z.infer<typeof createWalkInLabOrderSchema>;
export type CancelLabOrderInput = z.infer<typeof cancelLabOrderSchema>;
export type ListLabOrdersQuery = z.infer<typeof listLabOrdersQuerySchema>;
export type LabSpecimenStatusValue = z.infer<typeof labSpecimenStatusSchema>;
export type LabSpecimenRejectReasonValue = z.infer<typeof labSpecimenRejectReasonSchema>;
export type CollectLabSpecimensInput = z.infer<typeof collectLabSpecimensSchema>;
export type RejectLabSpecimenInput = z.infer<typeof rejectLabSpecimenSchema>;
export type LabWorklistBucketValue = z.infer<typeof labWorklistBucketSchema>;
export type LabWorklistQuery = z.infer<typeof labWorklistQuerySchema>;

/**
 * Whether a measured value sits inside the normal band for this patient
 * (P18-T04). Mirrors the Prisma `LabResultFlag` enum.
 */
export const labResultFlagSchema = z.enum([
  'NORMAL',
  'LOW',
  'HIGH',
  'CRITICAL_LOW',
  'CRITICAL_HIGH',
  'ABNORMAL',
]);

/**
 * One measured value, as the entry form sends it. Exactly one of the three
 * value fields is given, and which one is decided by the test's result type —
 * the service refuses a number typed into a CODED test rather than storing it
 * somewhere it will never be compared.
 */
const labResultValueSchema = z.object({
  valueNumeric: z.number().nullable().optional(),
  valueText: z.string().trim().min(1).max(MAX_NOTES_LENGTH).nullable().optional(),
  valueCoded: z.string().trim().min(1).max(MAX_NAME_LENGTH).nullable().optional(),
});

function hasExactlyOneValue(payload: {
  valueNumeric?: number | null;
  valueText?: string | null;
  valueCoded?: string | null;
}): boolean {
  return (
    [payload.valueNumeric, payload.valueText, payload.valueCoded].filter(
      (value) => value !== null && value !== undefined,
    ).length === 1
  );
}

const ONE_VALUE_ISSUE = {
  path: ['valueNumeric'],
  message: 'A result carries exactly one value',
};

/**
 * Deliberately a plain object rather than a refined one: this schema is nested
 * inside an array below, and `createZodDto`'s OpenAPI metadata factory cannot
 * read a `ZodEffects` in that position — the API fails to boot on the Swagger
 * scan rather than at request time. The one-value rule is applied by the batch
 * schema instead, per item, which reports the same issue against the same path.
 */
export const labResultEntrySchema = labResultValueSchema.extend({
  labOrderItemId: z.string().uuid(),
});

/**
 * Entry is a batch upsert: an analis works down a worksheet and saves the
 * order, not one number at a time. Saving twice re-states the same items
 * rather than adding versions — versioning is what an *amendment* is for, and
 * it starts only once a value has been released.
 */
export const enterLabResultsSchema = z
  .object({
    items: z.array(labResultEntrySchema).min(1).max(MAX_ORDER_ENTRIES),
  })
  .superRefine((payload, context) => {
    payload.items.forEach((item, index) => {
      if (hasExactlyOneValue(item)) {
        return;
      }
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'valueNumeric'],
        message: ONE_VALUE_ISSUE.message,
      });
    });
  });

/**
 * Correcting a released value. The reason is mandatory and is not a formality:
 * somebody may have treated a patient on the strength of the number being
 * replaced, and this sentence is what the amended report shows them.
 */
export const amendLabResultSchema = labResultValueSchema
  .extend({ reason: z.string().trim().min(1).max(MAX_NOTES_LENGTH) })
  .refine(hasExactlyOneValue, ONE_VALUE_ISSUE);

/**
 * The trend feed. `testCode` narrows to one test — the only useful shape, since
 * comparing Hb with GDS says nothing — and the range is clinic days.
 */
export const listPatientLabResultsQuerySchema = z.object({
  testCode: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

/**
 * How this clinic runs its bench (P18-T04). Both flags loosen a safety rule,
 * so both are optional on the wire and neither has a permissive default: a
 * PATCH that names one leaves the other exactly as it was.
 */
export const updateLaboratorySettingsSchema = z
  .object({
    technicianMayVerify: z.boolean().optional(),
    singleOperator: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });

export type LabResultFlagValue = z.infer<typeof labResultFlagSchema>;
export type LabResultEntryInput = z.infer<typeof labResultEntrySchema>;
export type EnterLabResultsInput = z.infer<typeof enterLabResultsSchema>;
export type AmendLabResultInput = z.infer<typeof amendLabResultSchema>;
export type ListPatientLabResultsQuery = z.infer<typeof listPatientLabResultsQuerySchema>;
export type UpdateLaboratorySettingsInput = z.infer<typeof updateLaboratorySettingsSchema>;

/**
 * A request sent outside has to name where it went — it is what the referral
 * letter prints and what the cashier reads when explaining why the work is not
 * on this bill. Naming a facility for work done in-house is the same mistake
 * in reverse, and the database CHECK refuses both.
 */
export const clinicalRequestDispositionSchema = z
  .object({
    fulfilmentSite: fulfilmentSiteSchema,
    chargeMode: chargeModeSchema,
    externalFacilityName: z.string().trim().min(1).max(MAX_FACILITY_NAME_LENGTH).optional(),
  })
  .superRefine((payload, context) => {
    if (payload.fulfilmentSite === 'EXTERNAL' && !payload.externalFacilityName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['externalFacilityName'],
        message: 'Name the facility the patient was sent to',
      });
    }
    if (payload.fulfilmentSite === 'INTERNAL' && payload.externalFacilityName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['externalFacilityName'],
        message: 'Work done here cannot name an outside facility',
      });
    }
  });

export type FulfilmentSiteValue = z.infer<typeof fulfilmentSiteSchema>;
export type ChargeModeValue = z.infer<typeof chargeModeSchema>;
export type ClinicalRequestDispositionInput = z.infer<typeof clinicalRequestDispositionSchema>;

/**
 * Where one rendering of the hasil laboratorium is on its way to the file
 * (P18-T05). Mirrors the Prisma `LabReportStatus` enum. `PENDING` is a row the
 * worker will claim; `FAILED` is one it gave up on after the last retry —
 * visible on the order, and re-enqueued by the next amendment.
 */
export const labReportStatusSchema = z.enum(['PENDING', 'READY', 'FAILED']);

export type LabReportStatusValue = z.infer<typeof labReportStatusSchema>;
