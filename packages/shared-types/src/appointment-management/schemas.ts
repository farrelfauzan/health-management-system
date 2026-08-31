import { z } from 'zod';

export const APPOINTMENT_STATUSES = [
  'REQUESTED',
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
] as const;

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export type AppointmentStatusValue = z.infer<typeof appointmentStatusSchema>;

export const APPOINTMENT_TYPES = ['SESSION', 'SPECIAL_REQUEST'] as const;

export const appointmentTypeSchema = z.enum(APPOINTMENT_TYPES);

export type AppointmentTypeValue = z.infer<typeof appointmentTypeSchema>;

/**
 * Who an appointment is for (`P17-T02`).
 *
 * The two are kept apart in the wire shape rather than flattened to a name and
 * a nullable MRN, because the difference decides what the counter does next: a
 * `PATIENT` is registered and queued, a `PROSPECTIVE_PATIENT` must first be
 * searched for in the registry and then linked or converted. A caller that
 * reads only the name cannot accidentally treat the second as the first.
 */
export const APPOINTMENT_SUBJECT_KINDS = ['PATIENT', 'PROSPECTIVE_PATIENT'] as const;

export const appointmentSubjectKindSchema = z.enum(APPOINTMENT_SUBJECT_KINDS);

export type AppointmentSubjectKindValue = z.infer<typeof appointmentSubjectKindSchema>;

export const SESSION_BOOKING_CUTOFF_MINUTES = 60;

export const SPECIAL_REQUEST_MIN_LEAD_DAYS = 3;

export const APPOINTMENT_SESSION_STATUSES = ['OPEN', 'CLOSED', 'CANCELLED'] as const;

export const appointmentSessionStatusSchema = z.enum(APPOINTMENT_SESSION_STATUSES);

export type AppointmentSessionStatusValue = z.infer<typeof appointmentSessionStatusSchema>;

export const APPOINTMENT_STATUS_TRANSITIONS: Record<
  AppointmentStatusValue,
  readonly AppointmentStatusValue[]
> = {
  REQUESTED: ['SCHEDULED', 'REJECTED', 'CANCELLED'],
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
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

const WEEKDAY_INDEX_BY_LABEL: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedDayAndTime(
  scheduledAt: Date,
  timeZone: string,
): { dayOfWeek: number; timeOfDay: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(scheduledAt);
  const findPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    dayOfWeek: WEEKDAY_INDEX_BY_LABEL[findPart('weekday')] ?? -1,
    timeOfDay: `${findPart('hour')}:${findPart('minute')}`,
  };
}

/**
 * Checks a UTC instant against schedule windows whose dayOfWeek/startTime/endTime
 * are wall-clock values in the given IANA timeZone (defaults to UTC).
 */
export function isWithinDoctorAvailability(params: {
  scheduledAt: Date;
  schedules: AppointmentAvailabilityWindow[];
  timeZone?: string;
}): boolean {
  const { scheduledAt, schedules, timeZone = 'UTC' } = params;
  if (schedules.length === 0) {
    return true;
  }
  const { dayOfWeek, timeOfDay } = getZonedDayAndTime(scheduledAt, timeZone);
  return schedules.some(
    (window) =>
      window.isAvailable &&
      window.dayOfWeek === dayOfWeek &&
      window.startTime <= timeOfDay &&
      timeOfDay < window.endTime,
  );
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const readPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    readPart('year'),
    readPart('month') - 1,
    readPart('day'),
    readPart('hour'),
    readPart('minute'),
    readPart('second'),
  );
  return asUtc - instant.getTime();
}

/**
 * Interprets a calendar date + HH:mm wall-clock pair in the given IANA timeZone
 * and returns the corresponding UTC instant.
 */
export function buildZonedDateTime(params: {
  date: string;
  time: string;
  timeZone: string;
}): Date {
  const { date, time, timeZone } = params;
  const naiveUtc = new Date(`${date}T${time}:00.000Z`);
  const firstOffset = getTimeZoneOffsetMs(naiveUtc, timeZone);
  const adjusted = new Date(naiveUtc.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(adjusted, timeZone);
  return secondOffset === firstOffset ? adjusted : new Date(naiveUtc.getTime() - secondOffset);
}

/** Returns the 0-6 (Sunday-first) day of week for a YYYY-MM-DD calendar date. */
export function getDayOfWeekForDate(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD calendar date');

export const createSessionAppointmentSchema = z.object({
  type: z.literal('SESSION'),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  sessionDate: calendarDateSchema,
  reason: z.string().trim().min(2).max(500).optional(),
  notes: z.string().trim().min(2).max(2000).optional(),
});

export const createSpecialRequestAppointmentSchema = z.object({
  type: z.literal('SPECIAL_REQUEST'),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  requestedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(2).max(500),
  notes: z.string().trim().min(2).max(2000).optional(),
});

export const createAppointmentSchema = z.discriminatedUnion('type', [
  createSessionAppointmentSchema,
  createSpecialRequestAppointmentSchema,
]);

/**
 * Flattened OpenAPI/document shape of the create union — request validation
 * uses createAppointmentSchema; this only feeds Swagger and client codegen.
 */
export const createAppointmentDocSchema = z.object({
  type: appointmentTypeSchema,
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  scheduleId: z.string().uuid().optional(),
  sessionDate: calendarDateSchema.optional(),
  requestedAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(2).max(500).optional(),
  notes: z.string().trim().min(2).max(2000).optional(),
});

export const approveAppointmentSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

export const rejectAppointmentSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

export const listDoctorSessionsQuerySchema = z
  .object({
    from: calendarDateSchema,
    to: calendarDateSchema,
  })
  .refine((query) => query.from <= query.to, {
    message: 'from must be earlier than or equal to to',
  });

export const updateAppointmentSessionSchema = z
  .object({
    maxPatients: z.number().int().min(1).nullable().optional(),
    status: appointmentSessionStatusSchema.optional(),
  })
  .refine((payload) => payload.maxPatients !== undefined || payload.status !== undefined, {
    message: 'At least one field must be provided',
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
export type CreateSessionAppointmentInput = z.infer<typeof createSessionAppointmentSchema>;
export type CreateSpecialRequestAppointmentInput = z.infer<
  typeof createSpecialRequestAppointmentSchema
>;
export type ApproveAppointmentInput = z.infer<typeof approveAppointmentSchema>;
export type RejectAppointmentInput = z.infer<typeof rejectAppointmentSchema>;
export type ListDoctorSessionsQueryInput = z.infer<typeof listDoctorSessionsQuerySchema>;
export type UpdateAppointmentSessionInput = z.infer<typeof updateAppointmentSessionSchema>;
export type ListAppointmentsQueryInput = z.infer<typeof listAppointmentsQuerySchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
