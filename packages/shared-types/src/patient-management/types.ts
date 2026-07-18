export type ListPatientsParams = {
  page: number;
  limit: number;
  search?: string;
  doctorId?: string;
};

export type CreatePatientRecordPayload = {
  mrn: string;
  fullName: string;
  dateOfBirth: Date;
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
  phoneNumber: string;
  address: string;
  ownerUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
