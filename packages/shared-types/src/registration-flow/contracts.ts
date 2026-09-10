import type { AppointmentStatusValue } from '#appointment-management/schemas';
import type { CheckInWindowReason } from '#registration-flow/resolve-checkin-window';
import type { RegistrationStatusValue } from '#registration-flow/schemas';

/**
 * The doctor's practice hours for this registration today, and when the desk
 * may start checking the patient in (P19-T16). Null when the registration has
 * no doctor to be practising — a LAB_ONLY visit or a walk-in with no
 * appointment — and equally null when the doctor holds no window today, which
 * is the case the queue row has to render as "not practising".
 */
export type RegistrationCheckInWindow = {
  /** Clinic-local HH:mm. */
  start: string;
  end: string;
  /** `start` minus the early-arrival grace. */
  opensAt: string;
  /** When check-in stops; later than `end` only for an exact-time request. */
  closesAt: string;
};

/**
 * Why a check-in was refused, alongside the hours to quote (P19-T16). Rides in
 * the `details` of the `REGISTRATION_OUTSIDE_SESSION` error so the web can
 * render the sentence in the reader's own locale rather than echoing the
 * English message the API composed for logs and API clients.
 */
export type RegistrationOutsideSessionDetails = {
  doctorName: string;
  reason: CheckInWindowReason;
  sessionStart?: string;
  sessionEnd?: string;
  opensAt?: string;
  closesAt?: string;
};

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
  /**
   * Today's practice window for this registration's doctor (P19-T16). Absent
   * when there is no doctor or the doctor is not practising today; the queue
   * row renders the hours when it is present and disables Check in when it is
   * not, without waiting for the API to refuse.
   */
  todaySession?: RegistrationCheckInWindow;
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
