import { z } from 'zod';

/** A `YYYY-MM-DD` calendar date, which is how every maternal date travels. */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const estimatedDeliveryDateSourceSchema = z.enum(['LMP', 'ULTRASOUND', 'CLINICAL']);

export type EstimatedDeliveryDateSourceValue = z.infer<typeof estimatedDeliveryDateSourceSchema>;

export const pregnancyEpisodeStatusSchema = z.enum(['ACTIVE', 'DELIVERED', 'ENDED']);

export type PregnancyEpisodeStatusValue = z.infer<typeof pregnancyEpisodeStatusSchema>;

export const pregnancyEndReasonSchema = z.enum(['DELIVERY', 'MISCARRIAGE', 'LOST_TO_FOLLOW_UP']);

export type PregnancyEndReasonValue = z.infer<typeof pregnancyEndReasonSchema>;

/**
 * The shared shape of the episode's clinical fields. GPA is checked as a set
 * rather than field by field, because the rule is about the three together:
 * this pregnancy is counted in `gravida`, so the ones that already ended can
 * be at most one fewer. The database carries the same CHECK — this is the
 * message, that is the guarantee.
 */
const pregnancyEpisodeFieldsSchema = z.object({
  lastMenstrualPeriodDate: dateOnlySchema.nullish(),
  estimatedDeliveryDate: dateOnlySchema.optional(),
  eddSource: estimatedDeliveryDateSourceSchema.optional(),
  gravida: z.number().int().min(1).max(30),
  para: z.number().int().min(0).max(30),
  abortus: z.number().int().min(0).max(30),
  prePregnancyWeightKg: z.number().positive().max(300).nullish(),
  bloodType: z.string().trim().min(1).max(8).nullish(),
  rhesus: z.string().trim().min(1).max(8).nullish(),
  riskNotes: z.string().trim().max(2000).nullish(),
});

export const createPregnancyEpisodeSchema = pregnancyEpisodeFieldsSchema
  .refine((value) => value.para + value.abortus <= value.gravida - 1, {
    message: 'Para plus abortus must be at most gravida minus one',
    path: ['gravida'],
  })
  .refine(
    (value) =>
      Boolean(value.lastMenstrualPeriodDate) ||
      Boolean(value.estimatedDeliveryDate && value.eddSource),
    {
      message:
        'Provide the last menstrual period date, or an estimated delivery date with its source',
      path: ['lastMenstrualPeriodDate'],
    },
  );

export type CreatePregnancyEpisodeInput = z.infer<typeof createPregnancyEpisodeSchema>;

/**
 * Editing an ACTIVE episode. Every field is optional, but the GPA rule still
 * has to hold on whatever is sent together — a partial edit that leaves the
 * row inconsistent is refused by the database anyway, and a 422 with a reason
 * beats a constraint violation.
 */
export const updatePregnancyEpisodeSchema = pregnancyEpisodeFieldsSchema
  .partial()
  .refine(
    (value) =>
      value.gravida === undefined ||
      value.para === undefined ||
      value.abortus === undefined ||
      value.para + value.abortus <= value.gravida - 1,
    {
      message: 'Para plus abortus must be at most gravida minus one',
      path: ['gravida'],
    },
  );

export type UpdatePregnancyEpisodeInput = z.infer<typeof updatePregnancyEpisodeSchema>;

/**
 * Ending an episode. `DELIVERY` is deliberately absent: a delivered pregnancy
 * is closed by the delivery record (P25-T09), which knows the baby, not by a
 * free-standing status change.
 */
export const endPregnancyEpisodeSchema = z.object({
  reason: z.enum(['MISCARRIAGE', 'LOST_TO_FOLLOW_UP']),
  endedAt: dateOnlySchema.optional(),
});

export type EndPregnancyEpisodeInput = z.infer<typeof endPregnancyEpisodeSchema>;

/** A doctor visit the mother made elsewhere (FR-ANC-07). */
export const recordExternalDoctorVisitSchema = z.object({
  facilityName: z.string().trim().min(1).max(200),
  visitedAt: dateOnlySchema,
  isUltrasoundDone: z.boolean(),
});

export type RecordExternalDoctorVisitInput = z.infer<typeof recordExternalDoctorVisitSchema>;

export const fetalPresentationSchema = z.enum(['CEPHALIC', 'BREECH', 'TRANSVERSE', 'UNKNOWN']);

export const fetalHeadEngagementSchema = z.enum(['ENGAGED', 'NOT_ENGAGED']);

export const tetanusImmunizationStatusSchema = z.enum(['T0', 'T1', 'T2', 'T3', 'T4', 'T5']);

/**
 * The 10T examination upsert (P25-T07, FR-ANC-03). Every field is optional and
 * nullable: a checklist item that was not done is "not done", and a midwife
 * must be able to save a fundal height before the foetal heart is audible.
 *
 * The bounds are plausibility guards, not clinical rules — a fundal height of
 * 400 cm is a typo, and the referral rules are what judge a real value.
 */
export const upsertAntenatalExaminationSchema = z.object({
  muacCm: z.number().min(10).max(60).nullish(),
  fundalHeightCm: z.number().min(5).max(60).nullish(),
  fetalHeartRateBpm: z.number().int().min(50).max(240).nullish(),
  fetalPresentation: fetalPresentationSchema.nullish(),
  fetalHeadEngagement: fetalHeadEngagementSchema.nullish(),
  fetalCount: z.number().int().min(1).max(6).nullish(),
  estimatedFetalWeightGrams: z.number().int().min(100).max(8000).nullish(),
  tetanusStatus: tetanusImmunizationStatusSchema.nullish(),
  ironTabletsGiven: z.number().int().min(0).max(500).nullish(),
  counsellingTopics: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  caseManagementNotes: z.string().trim().max(2000).nullish(),
});

export type UpsertAntenatalExaminationInput = z.infer<typeof upsertAntenatalExaminationSchema>;

/** Setting a referral prompt aside. The reason is required (FR-ANC-04). */
export const dismissAntenatalReferralSchema = z.object({
  ruleCode: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(1).max(500),
});

export type DismissAntenatalReferralInput = z.infer<typeof dismissAntenatalReferralSchema>;

/** Issuing a surat rujukan from a visit (FR-ANC-04). */
export const issueAntenatalReferralLetterSchema = z.object({
  destination: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
});

export type IssueAntenatalReferralLetterInput = z.infer<
  typeof issueAntenatalReferralLetterSchema
>;
