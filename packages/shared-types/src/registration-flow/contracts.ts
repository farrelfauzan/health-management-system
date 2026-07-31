import type { AppointmentStatusValue } from '#appointment-management/schemas';
import type { RegistrationStatusValue } from '#registration-flow/schemas';

export type RegistrationPoli = {
  id: string;
  name: string;
};

export type RegistrationResponse = {
  id: string;
  patientId: string;
  appointmentId?: string;
  status: RegistrationStatusValue;
  /** The clinic-wide ticket-roll number. */
  queueNumber?: number;
  queueDate?: string;
  /**
   * The poli's own daily number, and the poli it belongs to. Both are absent
   * for a walk-in registered without an appointment — a patient with no poli
   * yet holds only the clinic-wide ticket.
   */
  poliQueueNumber?: number;
  poli?: RegistrationPoli;
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
  poliQueueNumber?: number;
  poli?: RegistrationPoli;
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

/**
 * One poli's slice of the day, so a poli display can render its own queue
 * without the caller re-grouping the entry list. `waiting` counts entries the
 * poli has not yet finished with (PENDING + CHECKED_IN) — the number that
 * answers "how many ahead of me".
 */
export type QueueBoardPoliSummary = {
  poli: RegistrationPoli;
  waiting: number;
  counts: QueueBoardCounts;
  lastIssuedNumber: number;
};

export type QueueBoardResponse = {
  date: string;
  counts: QueueBoardCounts;
  /**
   * Present for every poli with at least one ticket that day, in name order.
   * Registrations with no poli (walk-ins with no appointment) appear in
   * `entries` only — they are on the clinic-wide roll and nowhere else.
   */
  poli: QueueBoardPoliSummary[];
  entries: QueueBoardEntry[];
};
