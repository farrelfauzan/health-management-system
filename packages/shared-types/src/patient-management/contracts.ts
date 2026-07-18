export type PatientProfile = {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  phoneNumber: string;
  address: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PatientRelatedDoctor = {
  id: string;
  fullName: string;
  specialty: string;
};

export type PatientListItem = PatientProfile & {
  doctorCount: number;
};

export type PatientDetail = PatientProfile & {
  doctors: PatientRelatedDoctor[];
};

export type PatientsListMeta = {
  page: number;
  limit: number;
  total: number;
};
