import type { AppointmentStatusValue } from '#appointment-management/schemas';

export type AppointmentResponse = {
  id: string;
  patientId: string;
  doctorId: string;
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
