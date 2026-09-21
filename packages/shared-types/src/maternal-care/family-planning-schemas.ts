import { z } from 'zod';

/** A `YYYY-MM-DD` calendar date, which is how every KB date travels. */
const familyPlanningDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * The contraceptive methods a family planning course can hold (P25-T14).
 * MOW/MOP are out of scope: a sterilisation is a surgery, not a course with a
 * next due date.
 */
export const CONTRACEPTIVE_METHODS = [
  'PILL',
  'INJECTABLE_1_MONTH',
  'INJECTABLE_3_MONTH',
  'CONDOM',
  'IUD',
  'IMPLANT',
] as const;

export const contraceptiveMethodSchema = z.enum(CONTRACEPTIVE_METHODS);

export type ContraceptiveMethodValue = z.infer<typeof contraceptiveMethodSchema>;

/** Peserta KB baru (`NEW`) or aktif, continuing a method started elsewhere. */
export const acceptorTypeSchema = z.enum(['NEW', 'CONTINUING']);

export type AcceptorTypeValue = z.infer<typeof acceptorTypeSchema>;

/**
 * Why a course ended. A placeholder list until the pilot clinic's kohort KB
 * columns are known (P25-T14).
 */
export const contraceptiveDiscontinuationReasonSchema = z.enum([
  'SIDE_EFFECT',
  'WANTS_PREGNANCY',
  'METHOD_CHANGE',
  'MEDICAL_REASON',
  'LOST_TO_FOLLOW_UP',
  'OTHER',
]);

export type ContraceptiveDiscontinuationReasonValue = z.infer<
  typeof contraceptiveDiscontinuationReasonSchema
>;

/** The patient already has a live course; discontinue it first (409). */
export const FAMILY_PLANNING_COURSE_ACTIVE_ERROR_CODE = 'FAMILY_PLANNING_COURSE_ACTIVE';

/** The course was already discontinued and takes no more services (409). */
export const FAMILY_PLANNING_COURSE_DISCONTINUED_ERROR_CODE = 'FAMILY_PLANNING_COURSE_DISCONTINUED';

/** A date on the request falls before the course started (422). */
export const FAMILY_PLANNING_DATE_BEFORE_START_ERROR_CODE = 'FAMILY_PLANNING_DATE_BEFORE_START';

/** The linked encounter or delivery belongs to another patient (422). */
export const FAMILY_PLANNING_LINK_PATIENT_MISMATCH_ERROR_CODE =
  'FAMILY_PLANNING_LINK_PATIENT_MISMATCH';

/**
 * Starts one course. `nextDueOn` left out means "use the method's sourced
 * default"; an explicit `null` means "no due date". IUD and implant have no
 * default — the clinician enters the control date — and a condom never has
 * one, whatever is sent.
 */
export const startFamilyPlanningSchema = z.object({
  method: contraceptiveMethodSchema,
  acceptorType: acceptorTypeSchema,
  startedOn: familyPlanningDateSchema,
  providerDoctorId: z.string().uuid(),
  startEncounterId: z.string().uuid().nullish(),
  /** Set for KB pasca salin: the birth this course follows. */
  deliveryRecordId: z.string().uuid().nullish(),
  nextDueOn: familyPlanningDateSchema.nullish(),
  sideEffects: z.string().trim().max(2000).nullish(),
});

export type StartFamilyPlanningInput = z.infer<typeof startFamilyPlanningSchema>;

/** One follow-up of a live course: a reinjection, a resupply, a check-up. */
export const recordFamilyPlanningServiceSchema = z.object({
  servedOn: familyPlanningDateSchema,
  action: z.string().trim().min(1).max(500),
  encounterId: z.string().uuid().nullish(),
  nextDueOn: familyPlanningDateSchema.nullish(),
  sideEffects: z.string().trim().max(2000).nullish(),
});

export type RecordFamilyPlanningServiceInput = z.infer<typeof recordFamilyPlanningServiceSchema>;

export const discontinueFamilyPlanningSchema = z.object({
  discontinuedOn: familyPlanningDateSchema,
  reason: contraceptiveDiscontinuationReasonSchema,
});

export type DiscontinueFamilyPlanningInput = z.infer<typeof discontinueFamilyPlanningSchema>;

/** How far ahead the due list looks when nobody says (P25-T14). */
export const FAMILY_PLANNING_DUE_DEFAULT_WITHIN_DAYS = 7;

/** The furthest ahead the due list may look — a quarter, one DMPA cycle. */
export const FAMILY_PLANNING_DUE_MAX_WITHIN_DAYS = 90;

export const listFamilyPlanningDueQuerySchema = z.object({
  withinDays: z.coerce
    .number()
    .int()
    .min(0)
    .max(FAMILY_PLANNING_DUE_MAX_WITHIN_DAYS)
    .default(FAMILY_PLANNING_DUE_DEFAULT_WITHIN_DAYS),
});

export type ListFamilyPlanningDueQueryInput = z.infer<typeof listFamilyPlanningDueQuerySchema>;
