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
  /**
   * BPJS's `kodebooking` for a Mobile JKN booking (P14-T04). Absent for every
   * booking a human made, and the marker that stops P14-T05 re-publishing this
   * row back to BPJS as though it were a walk-in.
   */
  bpjsBookingCode?: string;
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
  specialty: { name: string };
  ownerUserId: string | null;
};

export type AppointmentWithRelationsRecord = AppointmentRecord & {
  patient: AppointmentPatientProjection;
  doctor: AppointmentDoctorProjection;
};
