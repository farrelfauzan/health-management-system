import { z } from 'zod';

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
    status: registrationStatusSchema.optional(),
    patientId: z.string().uuid().optional(),
    registeredFrom: z.string().datetime({ offset: true }).optional(),
    registeredTo: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (query) =>
      !query.registeredFrom ||
      !query.registeredTo ||
      new Date(query.registeredFrom) <= new Date(query.registeredTo),
    { message: 'registeredFrom must be earlier than or equal to registeredTo' },
  );

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
