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
  diagnoses: readonly SatusehatSubmissionDiagnosis[];
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
