import type {
  AppointmentSessionStatusValue,
  AppointmentStatusValue,
  AppointmentTypeValue,
} from '#appointment-management/schemas';

export type AppointmentResponse = {
  id: string;
  patientId: string;
  doctorId: string;
  type: AppointmentTypeValue;
  sessionId?: string;
  queueNumber?: number;
  scheduledAt: string;
  status: AppointmentStatusValue;
  reason?: string;
  notes?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentRelatedPatient = {
  id: string;
  mrn: string;
  fullName: string;
};

export type AppointmentRelatedDoctor = {
  id: string;
  fullName: string;
  specialty: string;
};

export type AppointmentListItem = AppointmentResponse & {
  patient: AppointmentRelatedPatient;
  doctor: AppointmentRelatedDoctor;
};

export type AppointmentsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type DoctorSessionListItem = {
  id: string | null;
  scheduleId: string;
  doctorId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentSessionStatusValue;
  maxPatients: number | null;
  bookedCount: number;
  remaining: number | null;
};

export type SessionQueueEntry = {
  appointmentId: string;
  queueNumber: number;
  status: AppointmentStatusValue;
  reason?: string;
  patient: AppointmentRelatedPatient;
};

export type AppointmentSessionResponse = {
  id: string;
  doctorId: string;
  scheduleId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  maxPatients: number | null;
  status: AppointmentSessionStatusValue;
  bookedCount: number;
};
