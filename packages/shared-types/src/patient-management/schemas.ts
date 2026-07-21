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

export const PATIENT_STATUSES = ['IN_PATIENT', 'OUT_PATIENT', 'DISCHARGED'] as const;

export const patientStatusSchema = z.enum(PATIENT_STATUSES);

export type PatientStatusValue = z.infer<typeof patientStatusSchema>;

export const PATIENT_SEXES = ['MALE', 'FEMALE'] as const;

export const patientSexSchema = z.enum(PATIENT_SEXES);

export type PatientSexValue = z.infer<typeof patientSexSchema>;

export const listPatientsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().min(1).optional(),
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

export const createPatientSchema = z.object({
  mrn: z.string().trim().min(3).max(64),
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: patientDateSchema
    .refine(isValidDateValue, 'Date of birth must be a valid calendar date')
    .refine(isDateNotFuture, 'Date of birth cannot be in the future'),
  sex: patientSexSchema,
  status: patientStatusSchema.optional().default('OUT_PATIENT'),
  phoneNumber: z.string().trim().min(6).max(32),
  address: z.string().trim().min(3).max(300),
  ownerUserId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
  doctorIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_INITIAL_DOCTOR_ASSIGNMENTS)
    .refine((ids) => new Set(ids).size === ids.length, 'Doctor IDs must be unique')
    .optional(),
});

export const updatePatientSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    dateOfBirth: patientDateSchema
      .refine(isValidDateValue, 'Date of birth must be a valid calendar date')
      .refine(isDateNotFuture, 'Date of birth cannot be in the future')
      .optional(),
    sex: patientSexSchema.optional(),
    status: patientStatusSchema.optional(),
    phoneNumber: z.string().trim().min(6).max(32).optional(),
    address: z.string().trim().min(3).max(300).optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export type ListPatientsQueryInput = z.infer<typeof listPatientsQuerySchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
