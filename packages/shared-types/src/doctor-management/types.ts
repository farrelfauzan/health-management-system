import type { DoctorEducationInput, DoctorLicenseTypeValue } from '#doctor-management/schemas';
import type { SpecialtySummary } from '#specialty/contracts';

/**
 * License entry as the repository persists it. The service converts the
 * YYYY-MM-DD schema input into `Date` values before crossing this boundary.
 */
export type DoctorLicenseWritePayload = {
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
};

export type ListDoctorsParams = {
  page: number;
  limit: number;
  search?: string;
  specialtyId?: string;
  patientId?: string;
  isActive?: boolean;
};

export type CreateDoctorRecordPayload = {
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  phoneNumber: string;
  email?: string;
  title?: string;
  degrees?: string;
  nik?: string;
  satusehatPractitionerId?: string;
  licenses?: DoctorLicenseWritePayload[];
  educations?: DoctorEducationInput[];
  ownerUserId?: string;
  isActive: boolean;
  patientIds?: string[];
  actorUserId: string;
};

export type UpdateDoctorRecordPayload = {
  fullName?: string;
  specialtyId?: string;
  phoneNumber?: string;
  email?: string | null;
  title?: string | null;
  degrees?: string | null;
  nik?: string | null;
  satusehatPractitionerId?: string | null;
  /** When present, replaces the whole active license list. */
  licenses?: DoctorLicenseWritePayload[];
  /** When present, replaces the whole active education list. */
  educations?: DoctorEducationInput[];
  ownerUserId?: string | null;
  isActive?: boolean;
};

export type DoctorRecord = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: SpecialtySummary;
  phoneNumber: string | null;
  email: string | null;
  title: string | null;
  degrees: string | null;
  /**
   * Masked last four digits only — the `nikCiphertext` and `nikIndex` columns
   * never leave the repository layer, and the plaintext NIK is never read back.
   */
  nikLast4: string | null;
  satusehatPractitionerId: string | null;
  ownerUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorLicenseRecord = {
  id: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorEducationRecord = {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  graduationYear: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorScheduleRecord = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
};

export type ReplaceDoctorSchedulesPayload = {
  doctorId: string;
  entries: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    maxPatients?: number | null;
  }>;
};
