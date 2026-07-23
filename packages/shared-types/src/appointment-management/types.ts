import type {
  AppointmentSessionStatusValue,
  AppointmentStatusValue,
  AppointmentTypeValue,
} from '#appointment-management/schemas';

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
  type: AppointmentTypeValue;
  scheduledAt: Date;
  status: AppointmentStatusValue;
  reason?: string;
  notes?: string;
  createdById: string;
};

export type BookSessionSlotPayload = {
  patientId: string;
  doctorId: string;
  scheduleId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  maxPatients: number | null;
  scheduledAt: Date;
  reason?: string;
  notes?: string;
  createdById: string;
};

export type BookSessionSlotResult =
  | { outcome: 'SESSION_NOT_OPEN' }
  | { outcome: 'SESSION_FULL' }
  | { outcome: 'ALREADY_BOOKED' }
  | { outcome: 'BOOKED'; appointmentId: string };

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

export type ListDoctorSessionsParams = {
  doctorId?: string;
  fromDate: string;
  toDate: string;
};

export type UpdateAppointmentSessionRecordPayload = {
  id: string;
  maxPatients?: number | null;
  status?: AppointmentSessionStatusValue;
};

export type AppointmentRecord = {
  id: string;
  patientId: string;
  doctorId: string;
  type: AppointmentTypeValue;
  sessionId: string | null;
  queueNumber: number | null;
  scheduledAt: Date;
  status: AppointmentStatusValue;
  reason: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AppointmentSessionRecord = {
  id: string;
  doctorId: string;
  scheduleId: string | null;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  maxPatients: number | null;
  status: AppointmentSessionStatusValue;
};

export type DoctorScheduleWindowRecord = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
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
