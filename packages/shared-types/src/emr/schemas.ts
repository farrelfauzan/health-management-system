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
 * Opens the clinical record for a checked-in registration. `doctorId` is
 * optional: a doctor opening their own encounter is resolved from their
 * profile, while front-desk staff name the attending practitioner explicitly.
 */
export const openEncounterSchema = z.object({
  registrationId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
});

/**
 * The SOAP note. Every field is nullable so a clinician can clear a section
 * they filled in by mistake, and optional so a PATCH touches only what it
 * names — omitting `plan` must not erase it.
 */
export const updateEncounterSoapSchema = z
  .object({
    subjective: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    objective: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    assessment: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
    plan: z.string().trim().max(MAX_SOAP_LENGTH).nullable().optional(),
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
  })
  .refine((payload) => payload.icd9cmCodeId !== undefined || (payload.code && payload.display), {
    message: 'Provide icd9cmCodeId, or both code and display',
    path: ['icd9cmCodeId'],
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

export type OpenEncounterInput = z.infer<typeof openEncounterSchema>;
export type UpdateEncounterSoapInput = z.infer<typeof updateEncounterSoapSchema>;
export type RecordVitalSignsInput = z.infer<typeof recordVitalSignsSchema>;
export type AddDiagnosisInput = z.infer<typeof addDiagnosisSchema>;
export type AddProcedureInput = z.infer<typeof addProcedureSchema>;
export type ListEncountersQueryInput = z.infer<typeof listEncountersQuerySchema>;
