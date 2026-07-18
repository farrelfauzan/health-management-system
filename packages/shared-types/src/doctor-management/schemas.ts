import { z } from 'zod';

export const MAX_INITIAL_PATIENT_ASSIGNMENTS = 20;
export const MAX_SCHEDULE_ENTRIES = 28;

export const scheduleTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use HH:MM 24-hour format');

export type ScheduleOverlapEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable?: boolean;
};

export function hasScheduleOverlap(entries: ScheduleOverlapEntry[]): boolean {
  const availableEntries = entries.filter((entry) => entry.isAvailable !== false);
  const entriesByDay = new Map<number, ScheduleOverlapEntry[]>();
  for (const entry of availableEntries) {
    const dayEntries = entriesByDay.get(entry.dayOfWeek) ?? [];
    dayEntries.push(entry);
    entriesByDay.set(entry.dayOfWeek, dayEntries);
  }
  for (const dayEntries of entriesByDay.values()) {
    const sortedEntries = [...dayEntries].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sortedEntries.length; i += 1) {
      const previousEntry = sortedEntries[i - 1];
      const currentEntry = sortedEntries[i];
      if (previousEntry && currentEntry && currentEntry.startTime < previousEntry.endTime) {
        return true;
      }
    }
  }
  return false;
}

export const doctorScheduleEntrySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: scheduleTimeSchema,
    endTime: scheduleTimeSchema,
    isAvailable: z.boolean().optional().default(true),
  })
  .refine((entry) => entry.startTime < entry.endTime, {
    message: 'startTime must be earlier than endTime',
  });

export const updateDoctorScheduleSchema = z
  .object({
    schedules: z.array(doctorScheduleEntrySchema).max(MAX_SCHEDULE_ENTRIES),
  })
  .refine((payload) => !hasScheduleOverlap(payload.schedules), {
    message: 'Schedule entries must not overlap on the same day',
  });

export const listDoctorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  patientId: z.string().uuid().optional(),
});

export const createDoctorSchema = z.object({
  licenseNumber: z.string().trim().min(3).max(64),
  fullName: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().min(6).max(32),
  ownerUserId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
  patientIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_INITIAL_PATIENT_ASSIGNMENTS)
    .refine((ids) => new Set(ids).size === ids.length, 'Patient IDs must be unique')
    .optional(),
});

export type DoctorScheduleEntryInput = z.infer<typeof doctorScheduleEntrySchema>;
export type UpdateDoctorScheduleInput = z.infer<typeof updateDoctorScheduleSchema>;
export type ListDoctorsQueryInput = z.infer<typeof listDoctorsQuerySchema>;
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
