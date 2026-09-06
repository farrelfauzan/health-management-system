import type { SatusehatSubmissionStatusValue } from '#satusehat/schemas';

/**
 * Repository projections and payloads for SATUSEHAT linkage. The `nik` fields
 * are decrypted by the repository (the only layer allowed to touch identifier
 * ciphertext) solely so the service can send them to the SATUSEHAT master
 * patient index; they must never appear in responses or logs.
 */
export type PatientSatusehatLinkTarget = {
  id: string;
  nik: string | null;
  hasSatusehatPatientId: boolean;
};

export type DoctorSatusehatLinkTarget = {
  id: string;
  nik: string | null;
  satusehatPractitionerId: string | null;
};

export type SavePatientIhsNumberPayload = {
  patientId: string;
  ihsNumber: string;
};

export type SaveDoctorIhsNumberPayload = {
  doctorId: string;
  ihsNumber: string;
};

export type SatusehatSubmissionRecord = {
  id: string;
  encounterId: string;
  status: SatusehatSubmissionStatusValue;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  submittedAt: Date | null;
  satusehatEncounterId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SatusehatSubmissionSoapNote = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  prognosis: 'BONAM' | 'DUBIA_AD_BONAM' | 'DUBIA_AD_MALAM' | 'MALAM' | null;
};

export type SatusehatSubmissionDiagnosis = {
  code: string;
  display: string;
  type: 'PRIMARY' | 'SECONDARY';
  recordedAt: Date;
};

export type SatusehatSubmissionVitalSigns = {
  recordedAt: Date;
  heightCm: number | null;
  weightKg: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  pulseRate: number | null;
  respiratoryRate: number | null;
  temperatureCelsius: number | null;
  oxygenSaturation: number | null;
};

export type SatusehatSubmissionMedication = {
  medicationId: string;
  code: string;
  kfaCode: string | null;
  name: string;
  unit: string | null;
};

export type SatusehatSubmissionPrescriptionItem = {
  prescriptionItemId: string;
  prescriptionId: string;
  medication: SatusehatSubmissionMedication;
  dosage: string;
  frequency: string;
  instructions: string | null;
  quantity: number;
};

export type SatusehatSubmissionPrescription = {
  prescriptionId: string;
  issuedAt: Date | null;
  items: readonly SatusehatSubmissionPrescriptionItem[];
};

/**
 * One ICD-9-CM-coded procedure performed during the visit. `code` and
 * `display` are the snapshot written at recording time; `isCoded` is false for
 * free-text procedures, which are skipped in the bundle and gap-reported
 * rather than guessed at (P10-T07).
 */
export type SatusehatSubmissionProcedure = {
  procedureId: string;
  code: string;
  display: string;
  isCoded: boolean;
  performedAt: Date;
  notes: string | null;
};

/**
 * One vaccination on the visit. `kfaCode` is null when the catalog row is
 * uncoded, which is what makes the row unreportable — recorded locally,
 * skipped in the bundle, named in the gap log (P10-T16).
 */
export type SatusehatSubmissionImmunization = {
  immunizationId: string;
  kfaCode: string | null;
  vaccineName: string;
  occurredAt: Date;
  lotNumber: string | null;
  expirationDate: string | null;
  doseNumber: number | null;
  route: 'IM' | 'SC' | 'ID' | 'ORAL' | 'NASAL' | null;
  site: 'LEFT_ARM' | 'RIGHT_ARM' | 'LEFT_THIGH' | 'RIGHT_THIGH' | 'OTHER' | null;
  notes: string | null;
};

export type SatusehatSubmissionDispenseItem = {
  dispenseItemId: string;
  dispenseRecordId: string;
  prescriptionId: string;
  medication: SatusehatSubmissionMedication;
  quantity: number;
  dispensedAt: Date;
};

/**
 * Everything the submission worker needs to rebuild one encounter bundle at
 * send time. IHS numbers are null when the profile is not linked yet — the
 * worker then attempts an automatic NIK lookup before failing the submission.
 */
export type SatusehatSubmissionBundleData = {
  encounterId: string;
  encounterStatus: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  patientId: string;
  patientName: string;
  patientIhsNumber: string | null;
  doctorId: string;
  doctorName: string;
  practitionerIhsNumber: string | null;
  arrivedAt: Date;
  startedAt: Date;
  endedAt: Date | null;
  /**
   * The SOAP narrative and prognosis, which the Composition and
   * ClinicalImpression are built from (P10-T15). Absent sections are omitted
   * from the document rather than sent blank.
   */
  soapNote: SatusehatSubmissionSoapNote;
  diagnoses: readonly SatusehatSubmissionDiagnosis[];
  procedures: readonly SatusehatSubmissionProcedure[];
  immunizations: readonly SatusehatSubmissionImmunization[];
  latestVitalSigns: SatusehatSubmissionVitalSigns | null;
  prescriptions: readonly SatusehatSubmissionPrescription[];
  dispenseItems: readonly SatusehatSubmissionDispenseItem[];
};

export type MarkSubmissionRetryPayload = {
  id: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string;
};

export type MarkSubmissionFailedPayload = {
  id: string;
  attempts: number;
  lastError: string;
};

export type ListSatusehatSubmissionsParams = {
  status?: SatusehatSubmissionStatusValue;
  encounterId?: string;
  skip: number;
  take: number;
};

export type SatusehatSubmissionPage = {
  items: SatusehatSubmissionRecord[];
  total: number;
};

/**
 * One practitioner test identity for the SATUSEHAT staging sandbox. There is
 * deliberately no IHS number: the published values do not match what the live
 * index returns, so the IHS number is only ever resolved from the NIK at link
 * time.
 */
export type SatusehatSandboxPractitioner = {
  readonly nik: string;
  readonly name: string;
};

/**
 * Arguments for one outbox claim. `leaseMs` is how long the claimed rows stay
 * invisible to other workers, which is what keeps a horizontally scaled
 * deployment from submitting the same encounter twice.
 */
export type ClaimDueSubmissionsPayload = {
  limit: number;
  leaseMs: number;
};
