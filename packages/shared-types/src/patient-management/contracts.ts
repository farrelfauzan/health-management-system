import type {
  AllergySeverityValue,
  BloodTypeValue,
  MaritalStatusValue,
  PatientRecordSourceValue,
  PatientSexValue,
  PatientStatusValue,
  PrivacyNoticeEvidenceInput,
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

export type PrivacyNoticeVersion = {
  id: string;
  version: string;
  effectiveAt: string;
  content: { id: string; en: string };
  contentHash: { id: string; en: string };
  counselApproved: boolean;
};

export type PatientPrivacyNoticeHistoryItem = {
  id: string;
  privacyNoticeVersionId: string;
  version: string;
  outcome: 'ACKNOWLEDGED' | 'PROVIDED_ACKNOWLEDGEMENT_DECLINED' | 'DEFERRED_EMERGENCY';
  locale: 'id' | 'en';
  contentHash: string;
  subjectType: 'SELF' | 'REPRESENTATIVE';
  representativeName?: string;
  representativeRelation?: string;
  actorUserId: string;
  provenance: PrivacyNoticeEvidenceInput['provenance'];
  recordedAt: string;
};

export type PatientPrivacyNoticeStatus = {
  currentNoticeVersionId: string;
  currentVersion: string;
  outcome?: PatientPrivacyNoticeHistoryItem['outcome'];
  recordedAt?: string;
  requiresCapture: boolean;
};

export type PatientProfile = {
  id: string;
  mrn: string;
  fullName: string;
  /**
   * How this record was created (`PCS-T07`). `CHANNEL_BOOKING` is a chat-made
   * draft the front desk still has to complete, and it is what tells a client
   * that the absent fields below are absent *by design* rather than by
   * omission.
   */
  source: PatientRecordSourceValue;
  /** Absent on a `CHANNEL_BOOKING` draft until the counter completes it. */
  dateOfBirth?: string;
  placeOfBirth?: string;
  sex?: PatientSexValue;
  status: PatientStatusValue;
  phoneNumber: string;
  /** Absent on a `CHANNEL_BOOKING` draft until the counter completes it. */
  address?: string;
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
  /**
   * Masked IHS number (`••••1234`), rendered from the stored last four
   * characters without decrypting a row — the same rule as
   * {@link PatientProfile.nikMasked}. Absent when the patient is not linked,
   * and absent on a linked row that predates `P10-T13` until the backfill has
   * run. The full value comes from `GET /patients/{id}/identifiers`, which is
   * audited.
   */
  satusehatPatientIdMasked?: string;
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
  lastVisitAt?: string;
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

export type PatientListItem = {
  id: string;
  fullName: string;
  status: PatientStatusValue;
  isActive: boolean;
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
