import { z } from 'zod';

export const patientDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

function parseDateValue(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function isValidDateValue(value: string): boolean {
  return parseDateValue(value) !== null;
}

function isDateNotFuture(value: string): boolean {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return false;
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return parsed.getTime() <= todayUtc;
}

export const MAX_INITIAL_DOCTOR_ASSIGNMENTS = 20;

export const NIK_LENGTH = 16;

export const BPJS_NUMBER_LENGTH = 13;

const FEMALE_BIRTH_DAY_OFFSET = 40;

/**
 * Canonical normaliser for national and payer identifiers. `3201 0112 3456
 * 7890` and `3201011234567890` are the same NIK but hash to different blind
 * indexes, so every write path — admin API, self-service registration, legacy
 * import — must normalise through this one function before validating,
 * encrypting or indexing.
 */
export function normaliseIdentifierDigits(value: string): string {
  return value.replace(/\D/g, '');
}

const MASK_CHARACTER = '•';

const MASK_HIDDEN_LENGTH = 8;

/**
 * Renders the masked identifier form (`••••••••7890`) that list views show
 * without decrypting a single row. Shared with the web client so the API and
 * the UI never disagree on how an identifier is displayed.
 */
export function maskIdentifierLast4(last4: string | null | undefined): string | undefined {
  if (!last4) {
    return undefined;
  }
  return `${MASK_CHARACTER.repeat(MASK_HIDDEN_LENGTH)}${last4}`;
}

function buildDigitsSchema(length: number, label: string) {
  return z
    .string()
    .transform(normaliseIdentifierDigits)
    .refine((value) => value.length === length, `${label} must be exactly ${length} digits`);
}

export const nikSchema = buildDigitsSchema(NIK_LENGTH, 'NIK');

export const bpjsNumberSchema = buildDigitsSchema(BPJS_NUMBER_LENGTH, 'BPJS number');

export const satusehatPatientIdSchema = z.string().trim().min(1).max(64);

/**
 * Medical record number. Server-generated on create and immutable afterwards,
 * so this schema is only ever used by the legacy-import path, where a clinic
 * migrating from paper or another vendor carries MRNs already printed on
 * physical folders.
 */
export const mrnSchema = z.string().trim().min(3).max(64);

export const placeOfBirthSchema = z.string().trim().min(2).max(120);

/**
 * Cross-checks the demographic data encoded in a NIK against the submitted date
 * of birth and sex. NIK has no checksum, but digits 7-12 encode `DDMMYY` with 40
 * added to `DD` for female citizens.
 *
 * Returns human-readable warnings rather than throwing: legacy and edge-case
 * NIKs exist and Dukcapil data is not perfectly consistent, so a mismatch is
 * routed to staff for confirmation instead of rejecting the registration.
 */
export function collectNikDemographicWarnings(input: {
  nik: string;
  dateOfBirth?: string;
  sex?: PatientSexValue;
}): string[] {
  const normalisedNik = normaliseIdentifierDigits(input.nik);
  if (normalisedNik.length !== NIK_LENGTH) {
    return [];
  }
  const rawDay = Number(normalisedNik.slice(6, 8));
  const month = Number(normalisedNik.slice(8, 10));
  const year = Number(normalisedNik.slice(10, 12));
  const isFemaleByNik = rawDay > FEMALE_BIRTH_DAY_OFFSET;
  const day = isFemaleByNik ? rawDay - FEMALE_BIRTH_DAY_OFFSET : rawDay;
  const warnings: string[] = [];
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    warnings.push('NIK does not encode a valid birth date; verify against the KTP');
    return warnings;
  }
  if (input.sex && (isFemaleByNik ? 'FEMALE' : 'MALE') !== input.sex) {
    warnings.push(`NIK encodes ${isFemaleByNik ? 'FEMALE' : 'MALE'} but ${input.sex} was submitted`);
  }
  if (input.dateOfBirth) {
    const [birthYear, birthMonth, birthDay] = input.dateOfBirth.split('-').map(Number);
    const matchesDate =
      birthDay === day && birthMonth === month && Number(String(birthYear).slice(-2)) === year;
    if (!matchesDate) {
      warnings.push('NIK encodes a different birth date than the one submitted');
    }
  }
  return warnings;
}

export const PATIENT_STATUSES = ['IN_PATIENT', 'OUT_PATIENT', 'DISCHARGED'] as const;

export const patientStatusSchema = z.enum(PATIENT_STATUSES);

export type PatientStatusValue = z.infer<typeof patientStatusSchema>;

export const PATIENT_SEXES = ['MALE', 'FEMALE'] as const;

export const patientSexSchema = z.enum(PATIENT_SEXES);

export type PatientSexValue = z.infer<typeof patientSexSchema>;

export const BLOOD_TYPES = ['A', 'B', 'AB', 'O'] as const;

export const bloodTypeSchema = z.enum(BLOOD_TYPES);

export type BloodTypeValue = z.infer<typeof bloodTypeSchema>;

export const RHESUS_FACTORS = ['POSITIVE', 'NEGATIVE'] as const;

export const rhesusFactorSchema = z.enum(RHESUS_FACTORS);

export type RhesusFactorValue = z.infer<typeof rhesusFactorSchema>;

export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;

export const maritalStatusSchema = z.enum(MARITAL_STATUSES);

export type MaritalStatusValue = z.infer<typeof maritalStatusSchema>;

/**
 * The six religions recognised on Indonesian civil registration documents,
 * plus an escape hatch for records that do not fit them.
 */
export const RELIGIONS = [
  'ISLAM',
  'PROTESTANTISM',
  'CATHOLICISM',
  'HINDUISM',
  'BUDDHISM',
  'CONFUCIANISM',
  'OTHER',
] as const;

export const religionSchema = z.enum(RELIGIONS);

export type ReligionValue = z.infer<typeof religionSchema>;

export const ALLERGY_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'] as const;

export const allergySeveritySchema = z.enum(ALLERGY_SEVERITIES);

export type AllergySeverityValue = z.infer<typeof allergySeveritySchema>;

export const MAX_PATIENT_ALLERGIES = 50;

export const patientAllergyInputSchema = z.object({
  substance: z.string().trim().min(2).max(120),
  reaction: z.string().trim().min(2).max(300).optional(),
  severity: allergySeveritySchema,
});

export const patientAllergiesSchema = z
  .array(patientAllergyInputSchema)
  .max(MAX_PATIENT_ALLERGIES)
  .refine(
    (allergies) =>
      new Set(allergies.map((allergy) => allergy.substance.toLowerCase())).size === allergies.length,
    'Allergy substances must be unique',
  );

export type PatientAllergyInput = z.infer<typeof patientAllergyInputSchema>;

export const listPatientsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().min(1).optional(),
    // Exact-match identifier lookup. Deliberately separate from `search`:
    // encrypted columns support neither partial nor range matching, so these
    // normalise, hash, then query the blind index.
    nik: nikSchema.optional(),
    bpjsNumber: bpjsNumberSchema.optional(),
    doctorId: z.string().uuid().optional(),
    status: patientStatusSchema.optional(),
    createdFrom: patientDateSchema
      .refine(isValidDateValue, 'Created-from must be a valid calendar date')
      .optional(),
    createdTo: patientDateSchema
      .refine(isValidDateValue, 'Created-to must be a valid calendar date')
      .optional(),
  })
  .refine(
    (query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo,
    { message: 'Created-from must be before or equal to created-to', path: ['createdFrom'] },
  );

/**
 * `mrn` is deliberately absent: it is allocated by the server inside the create
 * transaction. A client-supplied MRN can collide with an existing record and
 * nothing stops a caller from inventing a format. Clinics importing MRNs that
 * already exist on paper use {@link importPatientSchema} instead.
 */
export const createPatientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: patientDateSchema
    .refine(isValidDateValue, 'Date of birth must be a valid calendar date')
    .refine(isDateNotFuture, 'Date of birth cannot be in the future'),
  placeOfBirth: placeOfBirthSchema.optional(),
  sex: patientSexSchema,
  status: patientStatusSchema.optional().default('OUT_PATIENT'),
  phoneNumber: z.string().trim().min(6).max(32),
  address: z.string().trim().min(3).max(300),
  // Nullable: newborns have no NIK for weeks, foreign nationals carry a
  // passport or KITAS, and an unidentified emergency arrival needs a record
  // immediately. Never the primary key — `mrn` stays the internal anchor.
  nik: nikSchema.optional(),
  bpjsNumber: bpjsNumberSchema.optional(),
  email: z.string().trim().email().max(254).optional(),
  bloodType: bloodTypeSchema.optional(),
  rhesusFactor: rhesusFactorSchema.optional(),
  maritalStatus: maritalStatusSchema.optional(),
  occupation: z.string().trim().min(2).max(120).optional(),
  religion: religionSchema.optional(),
  emergencyContactName: z.string().trim().min(2).max(120).optional(),
  emergencyContactPhone: z.string().trim().min(6).max(32).optional(),
  guardianName: z.string().trim().min(2).max(120).optional(),
  guardianRelation: z.string().trim().min(2).max(60).optional(),
  allergies: patientAllergiesSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
  doctorIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_INITIAL_DOCTOR_ASSIGNMENTS)
    .refine((ids) => new Set(ids).size === ids.length, 'Doctor IDs must be unique')
    .optional(),
});

/**
 * Legacy import. Identical to a create except that the MRN comes from the
 * clinic's previous system, so it must be accepted verbatim — the number is
 * already printed on a folder and cannot be renumbered. Gated by
 * `patient.import-identifier`, never exposed on the ordinary create route.
 */
export const importPatientSchema = createPatientSchema.extend({
  mrn: mrnSchema,
});

/**
 * `mrn` is absent here too, and permanently. Correcting a wrong record is a
 * merge operation, not an MRN edit — a re-pointed MRN silently merges two
 * patients' histories.
 */
export const updatePatientSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    dateOfBirth: patientDateSchema
      .refine(isValidDateValue, 'Date of birth must be a valid calendar date')
      .refine(isDateNotFuture, 'Date of birth cannot be in the future')
      .optional(),
    placeOfBirth: placeOfBirthSchema.nullable().optional(),
    sex: patientSexSchema.optional(),
    status: patientStatusSchema.optional(),
    phoneNumber: z.string().trim().min(6).max(32).optional(),
    address: z.string().trim().min(3).max(300).optional(),
    nik: nikSchema.nullable().optional(),
    bpjsNumber: bpjsNumberSchema.nullable().optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    bloodType: bloodTypeSchema.nullable().optional(),
    rhesusFactor: rhesusFactorSchema.nullable().optional(),
    maritalStatus: maritalStatusSchema.nullable().optional(),
    occupation: z.string().trim().min(2).max(120).nullable().optional(),
    religion: religionSchema.nullable().optional(),
    emergencyContactName: z.string().trim().min(2).max(120).nullable().optional(),
    emergencyContactPhone: z.string().trim().min(6).max(32).nullable().optional(),
    guardianName: z.string().trim().min(2).max(120).nullable().optional(),
    guardianRelation: z.string().trim().min(2).max(60).nullable().optional(),
    // Replaces the whole list: the client always submits the complete set of
    // active allergies, and removed entries are soft-deleted rather than
    // dropped, so the clinical history survives.
    allergies: patientAllergiesSchema.optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export type ListPatientsQueryInput = z.infer<typeof listPatientsQuerySchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type ImportPatientInput = z.infer<typeof importPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
