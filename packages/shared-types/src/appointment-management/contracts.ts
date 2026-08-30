import type {
  AppointmentSessionStatusValue,
  AppointmentStatusValue,
  AppointmentSubjectKindValue,
  AppointmentTypeValue,
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
};
