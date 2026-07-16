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

export type PatientsListMeta = {
  page: number;
  limit: number;
  total: number;
};
