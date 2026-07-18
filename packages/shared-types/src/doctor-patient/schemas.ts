import { z } from 'zod';

export const doctorPatientActivityActions = ['ASSIGNED', 'UNASSIGNED'] as const;

export const createDoctorPatientAssignmentSchema = z.object({
  doctorId: z.string().uuid(),
  patientId: z.string().uuid(),
});

export const listDoctorPatientActivityQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    doctorId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    action: z.enum(doctorPatientActivityActions).optional(),
    actorUserId: z.string().uuid().optional(),
    occurredFrom: z.string().datetime().optional(),
    occurredTo: z.string().datetime().optional(),
  })
  .refine(
    (query) =>
      !query.occurredFrom ||
      !query.occurredTo ||
      new Date(query.occurredFrom).getTime() <= new Date(query.occurredTo).getTime(),
    { message: 'occurredFrom must be earlier than or equal to occurredTo' },
  );

export type DoctorPatientActivityAction = (typeof doctorPatientActivityActions)[number];
export type CreateDoctorPatientAssignmentInput = z.infer<
  typeof createDoctorPatientAssignmentSchema
>;
export type ListDoctorPatientActivityQueryInput = z.infer<
  typeof listDoctorPatientActivityQuerySchema
>;
