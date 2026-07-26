import type { DoctorLicenseTypeValue } from '#doctor-management/schemas';
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
  nik?: string;
  satusehatPractitionerId?: string;
  licenses?: DoctorLicenseWritePayload[];
  ownerUserId?: string;
  isActive: boolean;
  patientIds?: string[];
  actorUserId: string;
};

export type UpdateDoctorRecordPayload = {
  fullName?: string;
  specialtyId?: string;
  phoneNumber?: string;
  nik?: string | null;
  satusehatPractitionerId?: string | null;
  /** When present, replaces the whole active license list. */
  licenses?: DoctorLicenseWritePayload[];
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
  nik: string | null;
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
