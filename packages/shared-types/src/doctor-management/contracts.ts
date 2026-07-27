import type { DoctorLicenseTypeValue } from '#doctor-management/schemas';

export type DoctorProfile = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: string;
  phoneNumber?: string;
  email?: string;
  title?: string;
  degrees?: string;
  /**
   * Masked NIK (`••••••••0001`), rendered from the stored last four digits
   * without decrypting a row. Absent when no NIK is on file. Full values
   * require the `patient.read-identifier` permission delivered in P7-T07.
   */
  nikMasked?: string;
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

export type DoctorEducation = {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  graduationYear?: number;
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
  educations: DoctorEducation[];
  patients?: DoctorRelatedPatient[];
};

export type DoctorsListMeta = {
  page: number;
  limit: number;
  total: number;
};
