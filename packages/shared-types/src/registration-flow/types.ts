import type {
  AppointmentStatusValue,
  AppointmentTypeValue,
} from '#appointment-management/schemas';
import type { CheckInPracticeWindow } from '#registration-flow/resolve-checkin-window';
import type {
  RegistrationStatusValue,
  RegistrationTypeValue,
} from '#registration-flow/schemas';
import type { PrivacyNoticeEvidenceInput } from '#patient-management/schemas';

export type ListRegistrationsParams = {
  page: number;
  limit: number;
  search?: string;
  status?: RegistrationStatusValue;
  patientId?: string;
  doctorId?: string;
  registeredFrom?: Date;
  registeredTo?: Date;
};

/**
 * How far a registration permission reaches: `ANY` covers every record, `OWN`
 * only rows whose patient the actor owns. Mirrors the permission `scope`
 * column.
 */
export type RegistrationScopeMode = 'ANY' | 'OWN';

/**
 * Actor context every scoped registration repository query requires (SJ-2).
 * Ownership is patient-side only — a registration belongs to the patient
 * being registered; staff and doctors read the queue through `ANY`-scoped
 * routes. Mandatory, so forgetting the scope is a compile error rather than
 * a silently unscoped query.
 */
export type RegistrationScopeActor = {
  userId: string;
  scope: RegistrationScopeMode;
};

export type CreateRegistrationRecordPayload = {
  patientId: string;
  appointmentId?: string;
  /**
   * What the visit is for (P18-T10). A LAB_ONLY visit still draws the daily
   * antrian number — the patient queues at the front desk like anyone else —
   * but joins no poli, because no doctor sees them.
   */
  type?: RegistrationTypeValue;
  createdById: string;
  queueDate: Date;
  privacyNotice?: PrivacyNoticeEvidenceInput;
  actorUserId: string;
};

export type QueueNumberAllocationRow = {
  allocated: number;
};

export type ListQueueBoardParams = {
  queueDate: Date;
  /** Narrows the board to one poli's queue; omitted, it lists the whole clinic. */
  specialtyId?: string;
};

export type UpdateRegistrationRecordPayload = {
  id: string;
  status?: RegistrationStatusValue;
  appointmentId?: string | null;
  checkedInAt?: Date;
  completedAt?: Date;
};

export type FindOpenRegistrationParams = {
  patientId: string;
  excludeRegistrationId?: string;
};

export type RegistrationRecord = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  /**
   * What the visit is for. Read by the check-in window rule (P19-T16): a
   * LAB_ONLY walk-in has no doctor to be practising, so no session can gate it.
   */
  type: RegistrationTypeValue;
  status: RegistrationStatusValue;
  queueNumber: number | null;
  queueDate: Date | null;
  specialtyId: string | null;
  poliQueueNumber: number | null;
  registeredAt: Date;
  checkedInAt: Date | null;
  completedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RegistrationPatientProjection = {
  id: string;
  mrn: string;
  fullName: string;
  ownerUserId: string | null;
};

export type RegistrationDoctorProjection = {
  id: string;
  fullName: string;
  specialty: {
    name: string;
  };
};

export type RegistrationAppointmentSessionProjection = {
  id: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
};

export type RegistrationAppointmentProjection = {
  id: string;
  /**
   * `SPECIAL_REQUEST` names one approved instant rather than a session, and
   * the check-in window is that instant plus or minus the grace (P19-T16).
   */
  type: AppointmentTypeValue;
  doctorId: string;
  scheduledAt: Date;
  status: AppointmentStatusValue;
  doctor: RegistrationDoctorProjection;
  /** The session the booking joined, when it joined one. */
  session: RegistrationAppointmentSessionProjection | null;
};

/**
 * Practice windows for the doctors named on a page of registrations, keyed by
 * doctor id. Resolved once per page rather than once per row: the front desk
 * lists twenty tickets for three doctors, and twenty schedule lookups to
 * render three sets of opening hours is twenty queries too many.
 */
export type RegistrationDoctorWindows = ReadonlyMap<string, readonly CheckInPracticeWindow[]>;

export type RegistrationSpecialtyProjection = {
  id: string;
  name: string;
};

export type RegistrationWithRelationsRecord = RegistrationRecord & {
  patient: RegistrationPatientProjection;
  appointment: RegistrationAppointmentProjection | null;
  specialty: RegistrationSpecialtyProjection | null;
};
