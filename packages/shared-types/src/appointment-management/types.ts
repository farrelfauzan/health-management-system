import type { AppointmentStatusValue } from '#appointment-management/schemas';

export type ListAppointmentsParams = {
  page: number;
  limit: number;
  status?: AppointmentStatusValue;
  doctorId?: string;
  patientId?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  ownerUserId?: string;
};

export type CreateAppointmentRecordPayload = {
  patientId: string;
  doctorId: string;
  scheduledAt: Date;
  reason?: string;
  notes?: string;
  createdById: string;
};

export type UpdateAppointmentRecordPayload = {
  id: string;
  scheduledAt?: Date;
  status?: AppointmentStatusValue;
  reason?: string;
  notes?: string;
};

export type CancelAppointmentRecordPayload = {
  id: string;
  notes?: string;
};

export type FindConflictingAppointmentParams = {
  doctorId: string;
  scheduledAt: Date;
  excludeAppointmentId?: string;
};

export type AppointmentRecord = {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: Date;
  status: AppointmentStatusValue;
  reason: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AppointmentPatientProjection = {
  id: string;
  mrn: string;
  fullName: string;
  ownerUserId: string | null;
};

export type AppointmentDoctorProjection = {
  id: string;
  fullName: string;
  specialty: string;
  ownerUserId: string | null;
};

export type AppointmentWithRelationsRecord = AppointmentRecord & {
  patient: AppointmentPatientProjection;
  doctor: AppointmentDoctorProjection;
};
