import type { PatientSexValue, PatientStatusValue } from '#patient-management/schemas';

export type PatientProfile = {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  sex?: PatientSexValue;
  status: PatientStatusValue;
  phoneNumber: string;
  address: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PatientRelatedDoctor = {
  id: string;
  assignmentId: string;
  fullName: string;
  specialty: string;
};

export type PatientListItem = PatientProfile & {
  doctorCount: number;
  doctors: PatientRelatedDoctor[];
};

export type PatientDetail = PatientProfile & {
  doctors: PatientRelatedDoctor[];
};

export type PatientsListMeta = {
  page: number;
  limit: number;
  total: number;
};
