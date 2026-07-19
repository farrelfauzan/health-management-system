import type { AppointmentStatusValue } from '#appointment-management/schemas';
import type { RegistrationStatusValue } from '#registration-flow/schemas';

export type ListRegistrationsParams = {
  page: number;
  limit: number;
  status?: RegistrationStatusValue;
  patientId?: string;
  registeredFrom?: Date;
  registeredTo?: Date;
  ownerUserId?: string;
};

export type CreateRegistrationRecordPayload = {
  patientId: string;
  appointmentId?: string;
  createdById: string;
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

export type RegistrationAppointmentProjection = {
  id: string;
  scheduledAt: Date;
  status: AppointmentStatusValue;
};

export type RegistrationWithRelationsRecord = RegistrationRecord & {
  patient: RegistrationPatientProjection;
  appointment: RegistrationAppointmentProjection | null;
};
