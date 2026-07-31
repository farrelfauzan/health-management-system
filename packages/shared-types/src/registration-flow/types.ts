import type { AppointmentStatusValue } from '#appointment-management/schemas';
import type { RegistrationStatusValue } from '#registration-flow/schemas';
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
  ownerUserId?: string;
};

export type CreateRegistrationRecordPayload = {
  patientId: string;
  appointmentId?: string;
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

export type RegistrationAppointmentProjection = {
  id: string;
  scheduledAt: Date;
  status: AppointmentStatusValue;
  doctor: RegistrationDoctorProjection;
};

export type RegistrationSpecialtyProjection = {
  id: string;
  name: string;
};

export type RegistrationWithRelationsRecord = RegistrationRecord & {
  patient: RegistrationPatientProjection;
  appointment: RegistrationAppointmentProjection | null;
  specialty: RegistrationSpecialtyProjection | null;
};
