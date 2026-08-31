import type {
  AppointmentSessionStatusValue,
  AppointmentStatusValue,
  AppointmentTypeValue,
} from '#appointment-management/schemas';
import type { ChannelKindValue } from '#customer-service/schemas';

export type ListAppointmentsParams = {
  page: number;
  limit: number;
  status?: AppointmentStatusValue;
  doctorId?: string;
  patientId?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
};

/**
 * How far an appointment permission reaches: `ANY` covers every record, `OWN`
 * only the rows the actor participates in. Mirrors the permission `scope`
 * column.
 */
export type AppointmentScopeMode = 'ANY' | 'OWN';

/**
 * Actor context every scoped appointment repository query requires (SJ-2).
 * Appointment ownership is participant-side — the owning user of either the
 * patient or the doctor on the row; session ownership is doctor-side only.
 * Repositories merge the scope into the SQL `where`, never post-fetch.
 */
export type AppointmentScopeActor = {
  userId: string;
  scope: AppointmentScopeMode;
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
  /**
   * BPJS's `kodebooking` for a Mobile JKN booking (P14-T04). Absent for every
   * booking a human made, and the marker that stops P14-T05 re-publishing this
   * row back to BPJS as though it were a walk-in.
   */
  bpjsBookingCode?: string;
  /**
   * Which messaging channel booked this, absent for every booking a human made
   * (`PCS-T07`, strategy §5.1). Analytics and the arrival worklist both read
   * it, and neither can derive it from the patient: a *verified* customer's
   * booking attaches to a long-standing front-desk record.
   */
  bookingSource?: ChannelKindValue;
  /** The short code quoted back to the customer in the confirmation reply. */
  bookingReferenceCode?: string;
};

/**
 * A session booking made from the WhatsApp/Telegram channel (`PCS-T07`).
 *
 * Deliberately shaped like {@link BookBpjsAntreanSessionInput} rather than
 * like the tool's arguments: by the time this is built, the phone number has
 * been resolved to a patient — draft or real — and the opaque session token
 * has been decoded. What crosses this boundary is a booking, not a chat
 * message.
 */
export type BookChannelSessionInput = {
  patientId: string;
  doctorId: string;
  scheduleId: string;
  /** ISO calendar date in the clinic timezone. */
  sessionDate: string;
  channel: ChannelKindValue;
  bookingReferenceCode: string;
  /** The customer's own note, schema-capped at 200 characters upstream. */
  note?: string;
};

export type BookSessionSlotResult =
  | { outcome: 'SESSION_NOT_OPEN' }
  | { outcome: 'SESSION_FULL' }
  | { outcome: 'ALREADY_BOOKED' }
  | { outcome: 'DUPLICATE_BOOKING_CODE' }
  /**
   * `queueNumber` is the booking's position in its session, allocated inside
   * the same row lock that enforces capacity. It exists so `ambil antrean` can
   * answer with a number at booking time: the per-poli antrian number
   * (P14-T01) is allocated at check-in, which can be days later, and Mobile
   * JKN needs a number on the member's phone the moment they book.
   */
  | { outcome: 'BOOKED'; appointmentId: string; queueNumber: number };

/**
 * A session booking made by the inbound BPJS Antrean bridge (P14-T04) rather
 * than by a person. Separate from {@link CreateSessionAppointmentInput}
 * because it carries BPJS's booking code, which no HTTP client of the HMS API
 * may ever set — the wire schema has no such field, and this type is the only
 * way one reaches the database.
 */
export type BookBpjsAntreanSessionInput = {
  patientId: string;
  doctorId: string;
  scheduleId: string;
  sessionDate: string;
  bpjsBookingCode: string;
  reason?: string;
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
  /** Exactly one of these is set (`P17-T02`). */
  patientId: string | null;
  prospectivePatientId: string | null;
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

/**
 * Every identity one phone number resolved to, for §8.3's per-number cap on
 * active future bookings (`P17-T02`).
 *
 * Two lists rather than one, because the ids address different tables and a
 * merged list would have to guess which. Either may be empty; both empty means
 * the number resolved to nobody and the count is zero.
 */
export type CountActiveFutureAppointmentsSubjectIds = {
  patientIds: readonly string[];
  prospectivePatientIds: readonly string[];
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
  specialty: { name: string };
  ownerUserId: string | null;
};

/**
 * The prospective side of `P17-T02`'s dual key, as the repository projects it.
 *
 * There is no `mrn` and no `ownerUserId`, and neither is an oversight. No
 * medical record number has been spent on this person, and they have no portal
 * account to own the row — which is also why the `OWN` appointment scope
 * reaches these bookings through the doctor side only.
 */
export type AppointmentProspectivePatientProjection = {
  id: string;
  fullName: string;
};

export type AppointmentWithRelationsRecord = AppointmentRecord & {
  /** Exactly one of these is non-null, mirroring the two ids. */
  patient: AppointmentPatientProjection | null;
  prospectivePatient: AppointmentProspectivePatientProjection | null;
  doctor: AppointmentDoctorProjection;
};
