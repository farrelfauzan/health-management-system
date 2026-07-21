import type { PatientSexValue, PatientStatusValue } from '#patient-management/schemas';

export type ListPatientsParams = {
  page: number;
  limit: number;
  search?: string;
  doctorId?: string;
  status?: PatientStatusValue;
  createdFrom?: Date;
  createdTo?: Date;
};

export type CreatePatientRecordPayload = {
  mrn: string;
  fullName: string;
  dateOfBirth: Date;
  sex: PatientSexValue;
  status: PatientStatusValue;
  phoneNumber: string;
  address: string;
  ownerUserId?: string;
  isActive: boolean;
  doctorIds?: string[];
  actorUserId: string;
};

export type UpdatePatientRecordPayload = {
  fullName?: string;
  dateOfBirth?: Date;
  sex?: PatientSexValue;
  status?: PatientStatusValue;
  phoneNumber?: string;
  address?: string;
  ownerUserId?: string | null;
  isActive?: boolean;
};

export type PatientRecord = {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: Date;
  sex: PatientSexValue | null;
  status: PatientStatusValue;
  phoneNumber: string;
  address: string;
  ownerUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
