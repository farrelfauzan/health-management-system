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

type DeliveryStageTimes = {
  labourOnsetAt?: string | null;
  fullDilatationAt?: string | null;
  birthAt?: string | null;
  placentaDeliveredAt?: string | null;
  postpartumMonitoringEndedAt?: string | null;
};

/**
 * Kala I to IV happen in order. Each pair is judged only when both ends are
 * present, because a missing stage is a stage nobody recorded rather than one
 * that happened out of sequence.
 */
function assertDeliveryStagesInOrder(
  payload: DeliveryStageTimes,
  context: z.RefinementCtx,
): void {
  const ordered: ReadonlyArray<readonly [keyof DeliveryStageTimes, keyof DeliveryStageTimes]> = [
    ['labourOnsetAt', 'fullDilatationAt'],
    ['fullDilatationAt', 'birthAt'],
    ['labourOnsetAt', 'birthAt'],
    ['birthAt', 'placentaDeliveredAt'],
    ['placentaDeliveredAt', 'postpartumMonitoringEndedAt'],
    ['birthAt', 'postpartumMonitoringEndedAt'],
  ];
  for (const [earlier, later] of ordered) {
    const earlierAt = payload[earlier];
    const laterAt = payload[later];
    // Parsed rather than compared as strings: two valid ISO instants can carry
    // different offsets, and `+07:00` sorts after `Z` for the same moment.
    if (
      !earlierAt ||
      !laterAt ||
      new Date(earlierAt).getTime() <= new Date(laterAt).getTime()
    ) {
      continue;
    }
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [later],
      message: `${later} cannot be before ${earlier}`,
    });
  }
}

/** A uterotonic is a drug and a time together; half of that says nothing. */
function assertUterotonicIsComplete(
  payload: { uterotonicMedicationId?: string | null; uterotonicGivenAt?: string | null },
  context: z.RefinementCtx,
): void {
  const hasMedication = Boolean(payload.uterotonicMedicationId);
  const hasTime = Boolean(payload.uterotonicGivenAt);
  if (hasMedication === hasTime) {
    return;
  }
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [hasMedication ? 'uterotonicGivenAt' : 'uterotonicMedicationId'],
    message: 'Record the uterotonic and the time it was given together',
  });
}

/**
 * A stillborn baby carries her position among the babies of this birth; a live
 * one carries her patient record, whose `birthOrder` holds that position once
 * she is registered. Neither ever carries the other's.
 */
function assertOutcomeMatchesIdentity(
  payload: {
    outcome?: 'LIVE_BIRTH' | 'STILLBIRTH';
    stillbirthOrder?: number | null;
    newbornPatientId?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (payload.outcome === undefined) {
    return;
  }
  const isStillbirth = payload.outcome === 'STILLBIRTH';
  if (isStillbirth && !payload.stillbirthOrder) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stillbirthOrder'],
      message: 'A stillbirth needs its position among the babies of this birth',
    });
  }
  if (!isStillbirth && payload.stillbirthOrder) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stillbirthOrder'],
      message: "A live baby's birth order lives on her patient record",
    });
  }
  if (isStillbirth && payload.newbornPatientId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newbornPatientId'],
      message: 'A stillborn baby is never registered as a patient',
    });
  }
}

export const deliveryModeSchema = z.enum([
  'SPONTANEOUS_VAGINAL',
  'ASSISTED_VAGINAL',
  'CAESAREAN',
]);

export const perinealTearGradeSchema = z.enum([
  'NONE',
  'GRADE_1',
  'GRADE_2',
  'GRADE_3',
  'GRADE_4',
]);

export const birthOutcomeSchema = z.enum(['LIVE_BIRTH', 'STILLBIRTH']);

export type DeliveryModeValue = z.infer<typeof deliveryModeSchema>;
export type PerinealTearGradeValue = z.infer<typeof perinealTearGradeSchema>;
export type BirthOutcomeValue = z.infer<typeof birthOutcomeSchema>;

/**
 * Recording a birth (P25-T09, FR-INC-01).
 *
 * `birthAt` is the only required timing: it is the last baby's birth, it is
 * what ends the pregnancy, and a record without it could not say when the
 * pregnancy ended. Every other stage is optional because a woman who arrives
 * pushing has no recorded onset, and a half-filled partograf is the ordinary
 * case rather than an invalid one.
 *
 * The stage ordering is checked here as well as by the database: a 422 naming
 * the field is a better answer than a constraint violation.
 */
export const recordDeliverySchema = z
  .object({
    attendantDoctorId: z.string().uuid(),
    admissionId: z.string().uuid().nullish(),
    labourOnsetAt: z.string().datetime().nullish(),
    fullDilatationAt: z.string().datetime().nullish(),
    birthAt: z.string().datetime(),
    placentaDeliveredAt: z.string().datetime().nullish(),
    postpartumMonitoringEndedAt: z.string().datetime().nullish(),
    mode: deliveryModeSchema,
    episiotomy: z.boolean().default(false),
    perinealTearGrade: perinealTearGradeSchema.default('NONE'),
    uterotonicMedicationId: z.string().uuid().nullish(),
    uterotonicGivenAt: z.string().datetime().nullish(),
    bloodLossMl: z.number().int().min(0).max(10_000).nullish(),
    placentaComplete: z.boolean().nullish(),
    referredOut: z.boolean().default(false),
    referralReason: z.string().trim().min(1).max(500).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .superRefine((payload, context) => {
    assertDeliveryStagesInOrder(payload, context);
    assertUterotonicIsComplete(payload, context);
  });

export type RecordDeliveryInput = z.infer<typeof recordDeliverySchema>;

/** Correcting a recorded birth. Every field optional; the same rules apply. */
export const updateDeliverySchema = recordDeliverySchema.innerType()
  .partial()
  .superRefine((payload, context) => {
    assertDeliveryStagesInOrder(payload, context);
    assertUterotonicIsComplete(payload, context);
  });

export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;

/**
 * One baby of a birth, and the essentials done for her (FR-INC-03/05).
 *
 * `newbornPatientId` is optional on purpose: the midwife records the first
 * hour while it is happening, and the registration form (P24-T10) is filled in
 * afterwards. A stillbirth never gets one and carries `stillbirthOrder`
 * instead.
 */
export const recordNewbornCareSchema = z
  .object({
    outcome: birthOutcomeSchema,
    stillbirthOrder: z.number().int().min(1).max(10).nullish(),
    newbornPatientId: z.string().uuid().nullish(),
    sex: z.enum(['MALE', 'FEMALE']),
    birthWeightGrams: z.number().int().min(200).max(8000).nullish(),
    lengthCm: z.number().min(15).max(70).nullish(),
    headCircumferenceCm: z.number().min(15).max(60).nullish(),
    apgar1Min: z.number().int().min(0).max(10).nullish(),
    apgar5Min: z.number().int().min(0).max(10).nullish(),
    imdStartedAt: z.string().datetime().nullish(),
    imdDurationMinutes: z.number().int().min(0).max(240).nullish(),
    cordCareAt: z.string().datetime().nullish(),
    vitaminK1GivenAt: z.string().datetime().nullish(),
    vitaminK1MedicationId: z.string().uuid().nullish(),
    eyeProphylaxisGivenAt: z.string().datetime().nullish(),
    eyeProphylaxisMedicationId: z.string().uuid().nullish(),
    examinedAt: z.string().datetime().nullish(),
    identityTagAt: z.string().datetime().nullish(),
  })
  .superRefine((payload, context) => {
    assertOutcomeMatchesIdentity(payload, context);
  });

export type RecordNewbornCareInput = z.infer<typeof recordNewbornCareSchema>;

export const updateNewbornCareSchema = recordNewbornCareSchema.innerType()
  .partial()
  .superRefine((payload, context) => {
    assertOutcomeMatchesIdentity(payload, context);
  });

export type UpdateNewbornCareInput = z.infer<typeof updateNewbornCareSchema>;

/**
 * The nifas (KF) and neonatal (KN) visit codes (P25-T12). KF is SATUSEHAT's
 * `…/CodeSystem/episodeofcare/puerperium`, KN its `…/episodeofcare/neonate` —
 * both verified against the sandbox, which refuses a code outside the list.
 */
export const postnatalVisitCodeSchema = z.enum(['KF1', 'KF2', 'KF3', 'KF4', 'KN1', 'KN2', 'KN3']);

export type PostnatalVisitCodeValue = z.infer<typeof postnatalVisitCodeSchema>;

/** Whose visit it is: the mother (nifas) or one of the babies (neonatal). */
export const postnatalSubjectSchema = z.enum(['MOTHER', 'NEWBORN']);

export type PostnatalSubjectValue = z.infer<typeof postnatalSubjectSchema>;

/** "Kondisi payudara" — the PNC playbook's five SNOMED answers. */
export const postnatalBreastConditionSchema = z.enum([
  'NORMAL',
  'SWELLING',
  'REDNESS',
  'NIPPLE_DISCHARGE',
  'PAIN',
]);

export type PostnatalBreastConditionValue = z.infer<typeof postnatalBreastConditionSchema>;

/** "Warna lokhia" — rubra, serosa, alba, as the playbook codes them. */
export const lochiaColourSchema = z.enum(['RUBRA', 'SEROSA', 'ALBA']);

export type LochiaColourValue = z.infer<typeof lochiaColourSchema>;

/** "Produksi ASI" — the playbook's three `clinical-term` answers. */
export const breastMilkProductionSchema = z.enum(['PRESENT', 'LOW', 'ABSENT']);

export type BreastMilkProductionValue = z.infer<typeof breastMilkProductionSchema>;

/**
 * Counting an encounter as a nifas or neonatal visit (P25-T12).
 *
 * `newbornCareRecordId` is optional even for a NEWBORN visit: the baby's
 * record is found from the encounter's patient when it is left out, because a
 * registered baby has exactly one. It is refused for a MOTHER visit.
 */
export const linkPostnatalVisitSchema = z
  .object({
    subject: postnatalSubjectSchema,
    newbornCareRecordId: z.string().uuid().optional(),
  })
  .refine((value) => value.subject === 'NEWBORN' || value.newbornCareRecordId === undefined, {
    message: 'A nifas visit of the mother names no baby',
    path: ['newbornCareRecordId'],
  });

export type LinkPostnatalVisitInput = z.infer<typeof linkPostnatalVisitSchema>;

/**
 * The postnatal examination of one nifas visit (P25-T12). Every field is
 * optional for the same reason the 10T one is: an item not examined is "not
 * done", not invalid. Blood pressure, pulse, temperature and respiration are
 * absent — they are the encounter's vital signs.
 */
export const upsertPostnatalExaminationSchema = z
  .object({
    vaginalBleeding: z.boolean().nullish(),
    bloodLossMl: z.number().int().min(0).max(10_000).nullish(),
    perineumCondition: z.string().trim().max(500).nullish(),
    perinealInfectionSigns: z.boolean().nullish(),
    caesareanWoundInfectionSigns: z.boolean().nullish(),
    breastCondition: postnatalBreastConditionSchema.nullish(),
    uterineContraction: z.boolean().nullish(),
    lochiaColour: lochiaColourSchema.nullish(),
    lochiaOdour: z.boolean().nullish(),
    breastMilkProduction: breastMilkProductionSchema.nullish(),
    urination: z.boolean().nullish(),
    defecation: z.boolean().nullish(),
    newbornCareCounselling: z.boolean().nullish(),
    vitaminAGivenAt: z.string().datetime().nullish(),
    vitaminAMedicationId: z.string().uuid().nullish(),
    familyPlanningCounselling: z.boolean().nullish(),
  })
  .refine((value) => !value.vitaminAMedicationId || Boolean(value.vitaminAGivenAt), {
    message: 'A vitamin A medication needs the time it was given',
    path: ['vitaminAGivenAt'],
  });

export type UpsertPostnatalExaminationInput = z.infer<typeof upsertPostnatalExaminationSchema>;
