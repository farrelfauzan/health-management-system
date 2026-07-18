import { z } from 'zod';

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export type AppointmentStatusValue = z.infer<typeof appointmentStatusSchema>;

export const APPOINTMENT_STATUS_TRANSITIONS: Record<
  AppointmentStatusValue,
  readonly AppointmentStatusValue[]
> = {
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointmentStatus(
  fromStatus: AppointmentStatusValue,
  toStatus: AppointmentStatusValue,
): boolean {
  return APPOINTMENT_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

export type AppointmentAvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

export function isWithinDoctorAvailability(params: {
  scheduledAt: Date;
  schedules: AppointmentAvailabilityWindow[];
}): boolean {
  const { scheduledAt, schedules } = params;
  if (schedules.length === 0) {
    return true;
  }
  const dayOfWeek = scheduledAt.getUTCDay();
  const hours = String(scheduledAt.getUTCHours()).padStart(2, '0');
  const minutes = String(scheduledAt.getUTCMinutes()).padStart(2, '0');
  const timeOfDay = `${hours}:${minutes}`;
  return schedules.some(
    (window) =>
      window.isAvailable &&
      window.dayOfWeek === dayOfWeek &&
      window.startTime <= timeOfDay &&
      timeOfDay < window.endTime,
  );
}

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(2).max(500).optional(),
  notes: z.string().trim().min(2).max(2000).optional(),
});

export const listAppointmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: appointmentStatusSchema.optional(),
    doctorId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    scheduledFrom: z.string().datetime({ offset: true }).optional(),
    scheduledTo: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (query) =>
      !query.scheduledFrom ||
      !query.scheduledTo ||
      new Date(query.scheduledFrom) <= new Date(query.scheduledTo),
    { message: 'scheduledFrom must be earlier than or equal to scheduledTo' },
  );

export const updateAppointmentStatusSchema = z.enum(['CONFIRMED', 'COMPLETED', 'NO_SHOW']);

export const updateAppointmentSchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    status: updateAppointmentStatusSchema.optional(),
    reason: z.string().trim().min(2).max(500).optional(),
    notes: z.string().trim().min(2).max(2000).optional(),
  })
  .refine(
    (payload) =>
      payload.scheduledAt !== undefined ||
      payload.status !== undefined ||
      payload.reason !== undefined ||
      payload.notes !== undefined,
    { message: 'At least one field must be provided' },
  );

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type ListAppointmentsQueryInput = z.infer<typeof listAppointmentsQuerySchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
