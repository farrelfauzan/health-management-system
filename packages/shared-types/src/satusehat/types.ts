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

/**
 * A compounded prescription line (racikan, P10-T18). Reported as one
 * `Medication` of type SD with an `ingredient[]` per component — and skipped
 * whole when any component lacks a KFA code, because a half-described compound
 * is worse than an absent one: the next clinic would read it as complete.
 */
export type SatusehatSubmissionCompound = {
  compoundName: string;
  preparation: 'PUYER' | 'KAPSUL' | 'SIRUP' | 'SALEP' | 'OTHER' | null;
  components: ReadonlyArray<{
    medication: SatusehatSubmissionMedication;
    quantity: number;
    unit: string;
  }>;
};

export type SatusehatSubmissionPrescriptionItem = {
  prescriptionItemId: string;
  prescriptionId: string;
  /** Null for a compound line, which carries {@link compound} instead. */
  medication: SatusehatSubmissionMedication | null;
  compound: SatusehatSubmissionCompound | null;
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

export type SatusehatSubmissionDispenseItem = {
  dispenseItemId: string;
  dispenseRecordId: string;
  prescriptionId: string;
  /** Null for a compound line; `prescriptionItemId` identifies it instead. */
  medication: SatusehatSubmissionMedication | null;
  prescriptionItemId: string | null;
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
  diagnoses: readonly SatusehatSubmissionDiagnosis[];
  procedures: readonly SatusehatSubmissionProcedure[];
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
