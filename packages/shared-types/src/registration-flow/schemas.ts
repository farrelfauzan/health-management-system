import { z } from 'zod';

export const registrationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

function parseRegistrationDateValue(value: string): Date | null {
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

function isValidRegistrationDateValue(value: string): boolean {
  return parseRegistrationDateValue(value) !== null;
}

export const REGISTRATION_STATUSES = ['PENDING', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'] as const;

export const registrationStatusSchema = z.enum(REGISTRATION_STATUSES);

export type RegistrationStatusValue = z.infer<typeof registrationStatusSchema>;

export const REGISTRATION_STATUS_TRANSITIONS: Record<
  RegistrationStatusValue,
  readonly RegistrationStatusValue[]
> = {
  PENDING: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionRegistrationStatus(
  fromStatus: RegistrationStatusValue,
  toStatus: RegistrationStatusValue,
): boolean {
  return REGISTRATION_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

export const createRegistrationSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

export const listRegistrationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().min(1).optional(),
    status: registrationStatusSchema.optional(),
    patientId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional(),
    registeredFrom: registrationDateSchema
      .refine(isValidRegistrationDateValue, 'Registered-from must be a valid calendar date')
      .optional(),
    registeredTo: registrationDateSchema
      .refine(isValidRegistrationDateValue, 'Registered-to must be a valid calendar date')
      .optional(),
  })
  .refine(
    (query) =>
      !query.registeredFrom || !query.registeredTo || query.registeredFrom <= query.registeredTo,
    { message: 'registeredFrom must be earlier than or equal to registeredTo' },
  );

/**
 * Formats an instant as the YYYY-MM-DD calendar date it falls on in the given
 * IANA time zone. The daily queue is a clinic-local concept: a registration
 * at 23:30 UTC already belongs to the next day's antrian in Asia/Jakarta.
 */
export function getCalendarDateInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export const queueBoardQuerySchema = z.object({
  date: registrationDateSchema
    .refine(isValidRegistrationDateValue, 'Queue board date must be a valid calendar date')
    .optional(),
});

export const updateRegistrationStatusSchema = z.enum(['CHECKED_IN', 'COMPLETED', 'CANCELLED']);

export const updateRegistrationSchema = z
  .object({
    status: updateRegistrationStatusSchema.optional(),
    appointmentId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (payload) => payload.status !== undefined || payload.appointmentId !== undefined,
    { message: 'At least one field must be provided' },
  );

export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
export type ListRegistrationsQueryInput = z.infer<typeof listRegistrationsQuerySchema>;
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;
export type QueueBoardQueryInput = z.infer<typeof queueBoardQuerySchema>;
