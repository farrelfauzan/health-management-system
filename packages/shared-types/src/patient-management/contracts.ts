import type {
  AllergySeverityValue,
  BloodTypeValue,
  MaritalStatusValue,
  PatientSexValue,
  PatientStatusValue,
  ReligionValue,
  RhesusFactorValue,
} from '#patient-management/schemas';

export type PatientAllergy = {
  id: string;
  substance: string;
  reaction?: string;
  severity: AllergySeverityValue;
  createdAt: string;
  updatedAt: string;
};

export type PatientProfile = {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  placeOfBirth?: string;
  sex?: PatientSexValue;
  status: PatientStatusValue;
  phoneNumber: string;
  address: string;
  /**
   * Masked NIK (`••••••••7890`), rendered from the stored last four digits
   * without decrypting a row. Absent when no NIK is on file. Full values come
   * from `GET /patients/{id}/identifiers`, which requires
   * `patient.read-identifier` and is audited.
   */
  nikMasked?: string;
  /** Masked BPJS number, same rules as {@link PatientProfile.nikMasked}. */
  bpjsNumberMasked?: string;
  /** Whether a SATUSEHAT IHS number has been resolved for this patient. */
  hasSatusehatPatientId: boolean;
  email?: string;
  bloodType?: BloodTypeValue;
  rhesusFactor?: RhesusFactorValue;
  maritalStatus?: MaritalStatusValue;
  occupation?: string;
  religion?: ReligionValue;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  guardianName?: string;
  guardianRelation?: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Soft validation warnings surfaced to front-desk staff after a patient write.
 * A NIK that disagrees with the submitted birth date or sex is flagged, never
 * rejected — legacy and edge-case NIKs exist.
 */
export type PatientMutationMeta = {
  identifierWarnings: string[];
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
  /** Allergy count only — the full list is on the detail response. */
  allergyCount: number;
};

export type PatientDetail = PatientProfile & {
  doctors: PatientRelatedDoctor[];
  allergies: PatientAllergy[];
};

/**
 * Full, decrypted patient identifiers. Returned only by the dedicated unmask
 * route, only to a caller holding `patient.read-identifier`, and every response
 * is recorded as an audit event. Never embedded in a list or detail payload —
 * those carry {@link PatientProfile.nikMasked} instead.
 */
export type PatientIdentifiers = {
  id: string;
  mrn: string;
  nik?: string;
  bpjsNumber?: string;
  satusehatPatientId?: string;
};

export type PatientsListMeta = {
  page: number;
  limit: number;
  total: number;
};
