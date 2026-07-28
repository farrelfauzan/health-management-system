import type { AppointmentStatusValue } from '#appointment-management/schemas';
import type { RegistrationStatusValue } from '#registration-flow/schemas';

export type RegistrationResponse = {
  id: string;
  patientId: string;
  appointmentId?: string;
  status: RegistrationStatusValue;
  queueNumber?: number;
  queueDate?: string;
  registeredAt: string;
  checkedInAt?: string;
  completedAt?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationRelatedPatient = {
  id: string;
  mrn: string;
  fullName: string;
};

export type RegistrationRelatedDoctor = {
  id: string;
  fullName: string;
  specialty: string;
};

export type RegistrationRelatedAppointment = {
  id: string;
  scheduledAt: string;
  status: AppointmentStatusValue;
  doctor: RegistrationRelatedDoctor;
};

export type RegistrationListItem = RegistrationResponse & {
  patient: RegistrationRelatedPatient;
  appointment?: RegistrationRelatedAppointment;
};

export type RegistrationsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type QueueBoardEntry = {
  registrationId: string;
  queueNumber: number;
  status: RegistrationStatusValue;
  registeredAt: string;
  checkedInAt?: string;
  patient: RegistrationRelatedPatient;
  doctor?: RegistrationRelatedDoctor;
};

export type QueueBoardCounts = {
  pending: number;
  checkedIn: number;
  completed: number;
  cancelled: number;
};

export type QueueBoardResponse = {
  date: string;
  counts: QueueBoardCounts;
  entries: QueueBoardEntry[];
};
