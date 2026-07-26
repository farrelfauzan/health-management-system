import type { DoctorLicenseTypeValue } from '#doctor-management/schemas';

export type DoctorProfile = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: string;
  phoneNumber?: string;
  nik?: string;
  satusehatPractitionerId?: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorLicense = {
  id: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DoctorRelatedPatient = {
  id: string;
  assignmentId: string;
  mrn: string;
  fullName: string;
};

export type DoctorScheduleEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
};

export type DoctorListItem = DoctorProfile & {
  patientCount: number;
  schedules: DoctorScheduleEntry[];
};

export type DoctorDetail = DoctorProfile & {
  patientCount: number;
  schedules: DoctorScheduleEntry[];
  licenses: DoctorLicense[];
  patients?: DoctorRelatedPatient[];
};

export type DoctorsListMeta = {
  page: number;
  limit: number;
  total: number;
};
