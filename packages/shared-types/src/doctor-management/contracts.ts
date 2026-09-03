import type { DoctorLicenseTypeValue } from '#doctor-management/schemas';

export type DoctorProfile = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: string;
  phoneNumber?: string;
  /**
   * Read from the linked user account, not stored on the profile. Absent when
   * the doctor has no account yet — the address is the one they sign in with,
   * so there is exactly one copy of it.
   */
  email?: string;
  title?: string;
  degrees?: string;
  /**
   * Masked NIK (`••••••••0001`), rendered from the stored last four digits
   * without decrypting a row. Absent when no NIK is on file. Full values come
   * from `GET /doctors/{id}/identifiers`, which requires
   * `doctor.read-identifier` and is audited.
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

/**
 * Full, decrypted practitioner identifiers. Same rules as the patient
 * equivalent: dedicated route, `doctor.read-identifier` permission, audited on
 * every read. STR and SIP numbers are absent because they are not secret —
 * KKI/IDI publish them, so they ride along unmasked on `DoctorDetail`.
 */
export type DoctorIdentifiers = {
  id: string;
  nik?: string;
};

export type DoctorsListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * One practitioner licence on the expiry dashboard (P16-T19, FR-E3-33).
 *
 * Every field here is a number, a date, or a name the clinic already
 * administers on `DoctorLicense`. There is deliberately **no document field
 * of any kind** — no id, no filename, no `hasScan` boolean, not even a null
 * one. The absence is the contract: a reader cannot learn from this payload
 * whether the doctor has uploaded a scan of this licence, including a scan
 * they shared with the reader (FR-E3-35). Adding one would take a change to
 * this type and the OpenAPI contract it generates, which is exactly the
 * friction it is shaped to create.
 */
export type DoctorLicenseExpiryRow = {
  licenseId: string;
  doctorId: string;
  doctorName: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: string | null;
  expiresAt: string;
  /**
   * Whole days from today to `expiresAt`, negative once it has passed. Sent
   * rather than left to the client so every reader counts from the same day
   * — the clinic's timezone, not the browser's.
   */
  daysUntilExpiry: number;
};

/**
 * The expiry dashboard, bucketed by urgency (FR-E3-33). Buckets rather than a
 * flat sorted list because the question an administrator asks is "what is
 * already a problem, and what becomes one this quarter" — two ends of a
 * spectrum that a single ordering blurs. Each bucket is urgency-sorted
 * within itself.
 */
export type DoctorLicenseExpiryBucketsView = {
  expired: DoctorLicenseExpiryRow[];
  within30Days: DoctorLicenseExpiryRow[];
  within60Days: DoctorLicenseExpiryRow[];
  within90Days: DoctorLicenseExpiryRow[];
};
