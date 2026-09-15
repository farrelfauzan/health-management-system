import { z } from 'zod';

export const ENCOUNTER_STATUSES = ['IN_PROGRESS', 'FINISHED', 'CANCELLED'] as const;

export const encounterStatusSchema = z.enum(ENCOUNTER_STATUSES);

export type EncounterStatusValue = z.infer<typeof encounterStatusSchema>;

/**
 * Allowed encounter status transitions. Both closed states are terminal: a
 * medical record is corrected by superseding it, never by re-opening it, so a
 * FINISHED or CANCELLED encounter accepts no further transition.
 */
export const ENCOUNTER_STATUS_TRANSITIONS: Record<
  EncounterStatusValue,
  readonly EncounterStatusValue[]
> = {
  IN_PROGRESS: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
} as const;

export const DIAGNOSIS_TYPES = ['PRIMARY', 'SECONDARY'] as const;

export const diagnosisTypeSchema = z.enum(DIAGNOSIS_TYPES);

export type DiagnosisTypeValue = z.infer<typeof diagnosisTypeSchema>;

/**
 * Inclusive plausibility bounds for each vital sign, in the unit fixed by its
 * column (cm, kg, mmHg, beats/min, breaths/min, °C, %).
 *
 * These reject physiologically impossible values only — a decimal typo turning
 * 36.8 °C into 368 — never merely abnormal ones, because a critical reading
 * must still be recordable. They mirror the CHECK constraints in migration
 * `20260728120000_vital_signs`; `recordVitalSignsSchema` below derives its
 * ranges from this constant so the two cannot drift apart.
 */
export const VITAL_SIGNS_BOUNDS = {
  heightCm: { min: 0.01, max: 300 },
  weightKg: { min: 0.01, max: 700 },
  systolicBloodPressure: { min: 20, max: 400 },
  diastolicBloodPressure: { min: 10, max: 300 },
  pulseRate: { min: 0, max: 400 },
  respiratoryRate: { min: 0, max: 150 },
  temperatureCelsius: { min: 20, max: 46 },
  oxygenSaturation: { min: 0, max: 100 },
} as const;

export type VitalSignBounds = { min: number; max: number };

const VITAL_SIGNS_MEASUREMENT_KEYS = Object.keys(VITAL_SIGNS_BOUNDS) as ReadonlyArray<
  keyof typeof VITAL_SIGNS_BOUNDS
>;

const CENTIMETERS_PER_METER = 100;

const BMI_ROUNDING = 10;

const MAX_SOAP_LENGTH = 5000;

const MAX_NOTES_LENGTH = 1000;

const MAX_CODE_LENGTH = 16;

const MAX_DISPLAY_LENGTH = 255;

export function canTransitionEncounterStatus(
  fromStatus: EncounterStatusValue,
  toStatus: EncounterStatusValue,
): boolean {
  return ENCOUNTER_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * BMI in kg/m², rounded to one decimal, or null when either input is missing.
 *
 * Derived on every read and never stored: a stored copy goes stale the moment
 * a mistyped height or weight is corrected, and a stale BMI on a signed record
 * is worse than no BMI at all.
 */
export function calculateBodyMassIndex(params: {
  heightCm: number | null;
  weightKg: number | null;
}): number | null {
  const { heightCm, weightKg } = params;
  if (heightCm === null || weightKg === null || heightCm <= 0) {
    return null;
  }
  const heightMeters = heightCm / CENTIMETERS_PER_METER;
  return Math.round((weightKg / (heightMeters * heightMeters)) * BMI_ROUNDING) / BMI_ROUNDING;
}

function buildDecimalVitalSchema(bounds: VitalSignBounds) {
  return z.number().min(bounds.min).max(bounds.max).optional();
}

function buildIntegerVitalSchema(bounds: VitalSignBounds) {
  return z.number().int().min(bounds.min).max(bounds.max).optional();
}

function hasAnyMeasurement(payload: Record<string, unknown>): boolean {
  return VITAL_SIGNS_MEASUREMENT_KEYS.some((key) => payload[key] !== undefined);
}

/**
 * A calendar date with no time component, used to bound an encounter list by
 * clinic day. Validated against the real calendar so `2026-02-31` is rejected
 * rather than silently rolling into March.
 */
const encounterDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const [year = 0, month = 0, day = 0] = value.split('-').map((part) => Number(part));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    );
  }, 'Date must be a valid calendar date');

/**
 * Why a midwife is seeing a child under five (P25-T03, FR-AUTH-03). The
 * encounter has no other field saying the child is *sick*, and gating every
 * under-five visit would block her own-authority work (KN visits, HB0, growth
 * monitoring, first handling of a neonatal emergency — Permenkes 28/2017
 * Pasal 20), so the purpose is named when the encounter opens and only
 * `SICK_CHILD` needs the MTBS authority.
 */
export const ENCOUNTER_CHILD_VISIT_PURPOSES = [
  'WELL_CHILD',
  'NEONATAL_FIRST_AID',
  'SICK_CHILD',
] as const;

export const encounterChildVisitPurposeSchema = z.enum(ENCOUNTER_CHILD_VISIT_PURPOSES);

export type EncounterChildVisitPurposeValue = z.infer<typeof encounterChildVisitPurposeSchema>;

/**
 * A midwife must name a purpose for a child younger than this many months on
 * the clinic-local day: MTBS covers 0–59 months (Permenkes 25/2014 Pasal 1
 * angka 10), so 60 months exactly is not asked.
 */
export const MIDWIFE_CHILD_VISIT_PURPOSE_AGE_LIMIT_MONTHS = 60;

/**
 * `NEONATAL_FIRST_AID` is valid up to and including this age in days — the
 * neonatal period (Permenkes 25/2014 Pasal 1 angka 2; 28/2017 Pasal 20(4)).
 */
export const NEONATAL_FIRST_AID_MAX_AGE_DAYS = 28;

/** A midwife opened an encounter for a child under five without a purpose (422). */
export const CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE = 'CHILD_VISIT_PURPOSE_REQUIRED';

/** The purpose does not fit the child's age — `NEONATAL_FIRST_AID` past 28 days (422). */
export const CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE = 'CHILD_VISIT_PURPOSE_INVALID';

/**
 * Inserting or removing a contraceptive implant (P25-T03). No ICD-9-CM code
 * names an implant, so the procedure carries this flag and a midwife needs
 * `IUD_IMPLANT` whenever it is set — until P25-T14 gates by KB method.
 */
export const CONTRACEPTIVE_IMPLANT_ACTIONS = ['INSERTION', 'REMOVAL'] as const;

export const contraceptiveImplantActionSchema = z.enum(CONTRACEPTIVE_IMPLANT_ACTIONS);

export type ContraceptiveImplantActionValue = z.infer<typeof contraceptiveImplantActionSchema>;

/**
 * Opens the clinical record for a checked-in registration. `doctorId` is
 * optional: a doctor opening their own encounter is resolved from their
 * profile, while front-desk staff name the attending practitioner explicitly.
 */
export const openEncounterSchema = z.object({
  registrationId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
  /**
   * Required when the attending clinician is a midwife and the patient is
   * under 60 months; ignored (stored as null) otherwise (P25-T03).
   */
  childVisitPurpose: encounterChildVisitPurposeSchema.optional(),
});

/**
 * The SOAP note. Every field is nullable so a clinician can clear a section
 * they filled in by mistake, and optional so a PATCH touches only what it
 * names — omitting `plan` must not erase it.
 */
export const encounterPrognosisSchema = z.enum([
  'BONAM',
  'DUBIA_AD_BONAM',
  'DUBIA_AD_MALAM',
  'MALAM',
]);

export const updateEncounterSoapSchema = z
  .object({
    subjective: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    objective: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    assessment: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    plan: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    prognosis: encounterPrognosisSchema.nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one SOAP field must be provided',
  });

/**
 * One measurement set. Every value is optional — a front desk records weight
 * and blood pressure, a full set appears only when clinically indicated — but
 * an entirely empty row records nothing and is rejected.
 */
export const recordVitalSignsSchema = z
  .object({
    heightCm: buildDecimalVitalSchema(VITAL_SIGNS_BOUNDS.heightCm),
    weightKg: buildDecimalVitalSchema(VITAL_SIGNS_BOUNDS.weightKg),
    systolicBloodPressure: buildIntegerVitalSchema(VITAL_SIGNS_BOUNDS.systolicBloodPressure),
    diastolicBloodPressure: buildIntegerVitalSchema(VITAL_SIGNS_BOUNDS.diastolicBloodPressure),
    pulseRate: buildIntegerVitalSchema(VITAL_SIGNS_BOUNDS.pulseRate),
    respiratoryRate: buildIntegerVitalSchema(VITAL_SIGNS_BOUNDS.respiratoryRate),
    temperatureCelsius: buildDecimalVitalSchema(VITAL_SIGNS_BOUNDS.temperatureCelsius),
    oxygenSaturation: buildIntegerVitalSchema(VITAL_SIGNS_BOUNDS.oxygenSaturation),
    notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
    recordedAt: z.string().datetime().optional(),
  })
  .refine(hasAnyMeasurement, { message: 'At least one vital sign must be measured' })
  .refine(
    (payload) =>
      payload.systolicBloodPressure === undefined ||
      payload.diastolicBloodPressure === undefined ||
      payload.systolicBloodPressure > payload.diastolicBloodPressure,
    {
      message: 'Systolic blood pressure must be higher than diastolic',
      path: ['systolicBloodPressure'],
    },
  );

/**
 * Either name a catalog row — in which case the server snapshots its code and
 * title, so a client can never sign a display that disagrees with the
 * catalog — or supply both fields for a code the catalog does not carry yet.
 */
export const addDiagnosisSchema = z
  .object({
    icd10CodeId: z.string().uuid().optional(),
    code: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
    display: z.string().trim().min(1).max(MAX_DISPLAY_LENGTH).optional(),
    type: diagnosisTypeSchema.default('SECONDARY'),
    notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
  })
  .refine((payload) => payload.icd10CodeId !== undefined || (payload.code && payload.display), {
    message: 'Provide icd10CodeId, or both code and display',
    path: ['icd10CodeId'],
  });

export const addProcedureSchema = z
  .object({
    icd9cmCodeId: z.string().uuid().optional(),
    code: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
    display: z.string().trim().min(1).max(MAX_DISPLAY_LENGTH).optional(),
    notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
    performedAt: z.string().datetime().optional(),
    /**
     * Set when the procedure inserts or removes a contraceptive implant; a
     * midwife then needs the `IUD_IMPLANT` authority (P25-T03).
     */
    contraceptiveImplantAction: contraceptiveImplantActionSchema.optional(),
  })
  .refine((payload) => payload.icd9cmCodeId !== undefined || (payload.code && payload.display), {
    message: 'Provide icd9cmCodeId, or both code and display',
    path: ['icd9cmCodeId'],
  });

export const immunizationRouteSchema = z.enum(['IM', 'SC', 'ID', 'ORAL', 'NASAL']);

export const immunizationSiteSchema = z.enum([
  'LEFT_ARM',
  'RIGHT_ARM',
  'LEFT_THIGH',
  'RIGHT_THIGH',
  'OTHER',
]);

/**
 * Why a dose was given, in SATUSEHAT's `immunization-reason` code system
 * (P24-T12, FR-IM-03). The platform's codes carry a hyphen (`IM-Dasar`);
 * the stored value folds it into an underscore, and the mapper restores it.
 */
export const IMMUNIZATION_REASONS = [
  'IM_DASAR',
  'IM_BADUTA',
  'IM_SD',
  'IM_WUS',
  'IM_TAMBAHAN',
  'IM_KHUSUS',
  'IM_PILIHAN',
] as const;

export const immunizationReasonSchema = z.enum(IMMUNIZATION_REASONS);

const NEW_DOSE_REQUIRED_MESSAGE =
  'A dose given here needs its lot number, expiry date and dose number; tick isHistorical for a dose copied from a card';

/**
 * One vaccination recorded on the visit (P10-T16, P24-T12).
 *
 * `medicationId` names a row in the medication catalog flagged `isVaccine`:
 * vaccines are KFA products, so they live where the other products live and
 * the flag is what filters the picker.
 *
 * A dose given here (`isHistorical` false) must carry its lot number, expiry
 * date and dose number: SATUSEHAT refuses a primary-source Immunization
 * without any of them (RuleNumber 10306, 10307, 10450), and one refused
 * resource fails the whole visit. A dose copied from a card or KIA book is
 * `isHistorical`, is reported as not primary-source, and needs none of the
 * three — the platform accepts it without them, so nobody has to invent an
 * expiry date to save what the book says. The reason is required either way
 * (RuleNumber 10105).
 */
export const addImmunizationSchema = z
  .object({
    medicationId: z.string().uuid(),
    occurredAt: z.string().datetime().optional(),
    lotNumber: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
    expirationDate: z.string().date().optional(),
    doseNumber: z.number().int().min(1).max(20).optional(),
    route: immunizationRouteSchema.optional(),
    site: immunizationSiteSchema.optional(),
    performedById: z.string().uuid().optional(),
    notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
    isHistorical: z.boolean().default(false),
    reason: immunizationReasonSchema,
  })
  .superRefine((payload, context) => {
    if (payload.isHistorical) {
      return;
    }
    const missingFields = (['lotNumber', 'expirationDate', 'doseNumber'] as const).filter(
      (field) => payload[field] === undefined,
    );
    for (const field of missingFields) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: NEW_DOSE_REQUIRED_MESSAGE,
        path: [field],
      });
    }
  });

export const listEncountersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: encounterStatusSchema.optional(),
    patientId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional(),
    registrationId: z.string().uuid().optional(),
    startedFrom: encounterDateSchema.optional(),
    startedTo: encounterDateSchema.optional(),
  })
  .refine((query) => !query.startedFrom || !query.startedTo || query.startedFrom <= query.startedTo, {
    message: 'startedFrom must be earlier than or equal to startedTo',
  });

/**
 * A BPJS rujukan recorded on an open encounter (P11-T06). PCare offers two
 * referral paths — subspesialis (subSpecialtyCode, optionally with a sarana
 * facility code) and khusus/TACC (khususCode) — so at least one of the two
 * codes is required. Codes are sent to PCare as recorded: the subspesialis
 * catalog is per-specialty and not fully synced locally, so PCare is the
 * validator of record.
 */
export const upsertBpjsReferralSchema = z
  .object({
    destinationProviderCode: z.string().trim().min(1).max(32),
    subSpecialtyCode: z.string().trim().min(1).max(32).optional(),
    saranaCode: z.string().trim().min(1).max(32).optional(),
    khususCode: z.string().trim().min(1).max(32).optional(),
    estimatedReferralDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format'),
    notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
  })
  .refine(
    (payload) => payload.subSpecialtyCode !== undefined || payload.khususCode !== undefined,
    {
      message: 'Provide subSpecialtyCode (subspesialis referral) or khususCode (khusus/TACC)',
      path: ['subSpecialtyCode'],
    },
  );

export type ImmunizationRouteValue = z.infer<typeof immunizationRouteSchema>;
export type ImmunizationSiteValue = z.infer<typeof immunizationSiteSchema>;
export type ImmunizationReasonValue = z.infer<typeof immunizationReasonSchema>;
export type AddImmunizationInput = z.infer<typeof addImmunizationSchema>;

export type OpenEncounterInput = z.infer<typeof openEncounterSchema>;
export type EncounterPrognosisValue = z.infer<typeof encounterPrognosisSchema>;

export type UpdateEncounterSoapInput = z.infer<typeof updateEncounterSoapSchema>;
export type RecordVitalSignsInput = z.infer<typeof recordVitalSignsSchema>;
export type AddDiagnosisInput = z.infer<typeof addDiagnosisSchema>;
export type AddProcedureInput = z.infer<typeof addProcedureSchema>;
export type ListEncountersQueryInput = z.infer<typeof listEncountersQuerySchema>;
export type UpsertBpjsReferralInput = z.infer<typeof upsertBpjsReferralSchema>;
