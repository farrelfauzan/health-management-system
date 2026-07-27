import type { EncounterStatusValue } from '#emr/schemas';

export type EncounterRecord = {
  id: string;
  registrationId: string;
  patientId: string;
  doctorId: string;
  status: EncounterStatusValue;
  startedAt: Date;
  endedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEncounterRecordPayload = {
  registrationId: string;
  patientId: string;
  doctorId: string;
  createdById: string;
};

export type UpdateEncounterRecordPayload = {
  id: string;
  status?: EncounterStatusValue;
  endedAt?: Date;
};
