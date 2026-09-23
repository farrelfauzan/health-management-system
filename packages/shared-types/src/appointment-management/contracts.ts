import type { DoctorLicenseTypeValue } from '#doctor-management/schemas';
import type {
  AppointmentSessionStatusValue,
  AppointmentStatusValue,
  AppointmentSubjectKindValue,
  AppointmentTypeValue,
  SessionMoveBlockedReasonValue,
} from '#appointment-management/schemas';

export type AppointmentResponse = {
  id: string;
  /**
   * Absent on a booking taken from a messaging channel before the person has
   * ever attended; exactly one of the two ids is present (`P17-T02`). Read
   * {@link AppointmentListItem.subject} rather than branching on these unless
   * the id itself is what you need.
   */
  patientId?: string;
  prospectivePatientId?: string;
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

export type AppointmentRelatedDoctor = {
  id: string;
  fullName: string;
  specialty: string;
};

/**
 * The person an appointment is for, with the two sides of `P17-T02`'s dual
 * foreign key already resolved.
 *
 * Every read that used to carry `patient` carries this instead. Resolving once
 * here, rather than leaving each caller to branch on which id is set, is the
 * point: a queue board, a calendar and the arrival worklist all want a name and
 * a badge, and three independent branches are three chances for one of them to
 * render a prospective patient as a registered one.
 */
export type AppointmentSubject = {
  kind: AppointmentSubjectKindValue;
  /** The `PatientProfile` id, or the `ProspectivePatient` id — see `kind`. */
  id: string;
  fullName: string;
  /**
   * Absent for a prospective patient, and it is not a missing value: no medical
   * record number has been *spent* on them yet, and the whole of `P17-T01`
   * exists so that stays true until they arrive. Absent rather than blank --
   * an empty string renders as an MRN that failed to load, which is exactly the
   * misread that ends in a clerk creating a duplicate record.
   */
  mrn?: string;
};

export type AppointmentListItem = AppointmentResponse & {
  subject: AppointmentSubject;
  doctor: AppointmentRelatedDoctor;
};

export type AppointmentsListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * One lapsed practitioner licence, surfaced to a scheduler about to book
 * patients into a session (`P16-T20`, FR-E3-36).
 *
 * Structured `DoctorLicense` fields only — a type, a number and a date the
 * clinic already administers. No document is involved, consistent with the
 * §7.3.2 split: the scheduler learns that a permit has lapsed without anyone
 * having looked at, or established the existence of, a scan in that doctor's
 * vault.
 */
export type ExpiredDoctorLicence = {
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  expiresAt: string;
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
  /**
   * Why the clinic moved or cancelled this occurrence (P28), as the patients
   * were told. Absent on an ordinary session.
   */
  statusReason?: string;
  /** The replacement, present only on a `MOVED` occurrence (P28-T04). */
  movedTo?: SessionMovedToSummary;
  /**
   * Lapsed STR/SIP for this doctor (`P16-T20`), empty when none — and
   * **absent entirely** on patient-facing responses, which is why it is
   * optional rather than an always-present empty array. A patient browsing
   * for an appointment has no business learning that a doctor's permit has
   * expired; that is a compliance signal for whoever schedules, and it is
   * populated only for a caller who can already read the clinic's licence
   * expiry roster.
   *
   * v1 is a **warning only** — booking still proceeds (FR-E3-36). The hard
   * block (FR-E3-37) is a clinic-level setting defaulting to off, and is out
   * of scope.
   */
  expiredLicenses?: ExpiredDoctorLicence[];
};

/**
 * Where a `MOVED` occurrence went (P28-T04), so the calendar can say
 * "moved to Wed 13:00" on the struck-through original.
 */
export type SessionMovedToSummary = {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
};

export type DoctorSessionCalendarItem = DoctorSessionListItem & {
  doctor: AppointmentRelatedDoctor;
};

export type SessionQueueEntry = {
  appointmentId: string;
  queueNumber: number | null;
  status: AppointmentStatusValue;
  reason?: string;
  subject: AppointmentSubject;
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
  /** Why the clinic moved or cancelled the session (P28); null otherwise. */
  statusReason: string | null;
  /** The replacement of a `MOVED` session (P28-T04); null otherwise. */
  movedToSessionId: string | null;
};

/** A booking that stayed in the original session when it moved (P28-T04). */
export type SessionMoveBlockedBooking = {
  appointmentId: string;
  subject: AppointmentSubject;
  reason: SessionMoveBlockedReasonValue;
};

/**
 * What a move did (P28-T04). `blocked` is the front desk's worklist: those
 * bookings are still open, in the original session, and nobody was told.
 */
export type AppointmentSessionRescheduleResult = {
  source: AppointmentSessionResponse;
  target: AppointmentSessionResponse;
  movedCount: number;
  blocked: SessionMoveBlockedBooking[];
};

/** What a cancellation did (P28-T02). */
export type AppointmentSessionCancelResult = {
  session: AppointmentSessionResponse;
  cancelledCount: number;
};
