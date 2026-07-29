import type { DiagnosisTypeValue, EncounterStatusValue } from '#emr/schemas';
import type { PrescriptionStatusValue } from '#pharmacy-flow/schemas';

/**
 * One measurement set as the API returns it. `bodyMassIndex` is derived from
 * the height and weight on this row every time it is read and is absent when
 * either input is missing — see `calculateBodyMassIndex`.
 */
export type VitalSignsResponse = {
  id: string;
  encounterId: string;
  heightCm?: number;
  weightKg?: number;
  systolicBloodPressure?: number;
  diastolicBloodPressure?: number;
  pulseRate?: number;
  respiratoryRate?: number;
  temperatureCelsius?: number;
  oxygenSaturation?: number;
  bodyMassIndex?: number;
  notes?: string;
  recordedAt: string;
  recordedById?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * A recorded BPJS rujukan as the API returns it. `estimatedReferralDate` is a
 * YYYY-MM-DD calendar day — PCare formats it as dd-MM-yyyy on the wire.
 */
export type BpjsReferralResponse = {
  id: string;
  encounterId: string;
  destinationProviderCode: string;
  subSpecialtyCode?: string;
  saranaCode?: string;
  khususCode?: string;
  estimatedReferralDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * `code` and `display` are the snapshot the clinician signed. `icd10CodeId` is
 * provenance only: it says which catalog row the snapshot came from, and it
 * goes null if that row is ever removed.
 */
export type DiagnosisResponse = {
  id: string;
  encounterId: string;
  icd10CodeId?: string;
  code: string;
  display: string;
  type: DiagnosisTypeValue;
  notes?: string;
  recordedAt: string;
  recordedById?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProcedureResponse = {
  id: string;
  encounterId: string;
  icd9cmCodeId?: string;
  code: string;
  display: string;
  notes?: string;
  performedAt: string;
  recordedById?: string;
  createdAt: string;
  updatedAt: string;
};

export type EncounterRelatedPatient = {
  id: string;
  mrn: string;
  fullName: string;
};

export type EncounterRelatedDoctor = {
  id: string;
  licenseNumber: string;
  fullName: string;
};

/**
 * A prescription written during the visit, summarised rather than expanded:
 * the full medication list stays behind `/prescriptions`, which is where the
 * pharmacy reads it.
 */
export type EncounterRelatedPrescription = {
  id: string;
  status: PrescriptionStatusValue;
  issuedAt?: string;
  itemCount: number;
};

export type EncounterResponse = {
  id: string;
  registrationId: string;
  patientId: string;
  doctorId: string;
  status: EncounterStatusValue;
  startedAt: string;
  endedAt?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * List rows carry counts instead of the child collections: a clinic day view
 * shows dozens of encounters, and expanding every vitals row and diagnosis
 * into that response would move megabytes to render a table.
 */
export type EncounterListItem = EncounterResponse & {
  patient: EncounterRelatedPatient;
  doctor: EncounterRelatedDoctor;
  vitalSignsCount: number;
  diagnosisCount: number;
  procedureCount: number;
};

export type EncounterDetail = EncounterResponse & {
  patient: EncounterRelatedPatient;
  doctor: EncounterRelatedDoctor;
  vitalSigns: VitalSignsResponse[];
  diagnoses: DiagnosisResponse[];
  procedures: ProcedureResponse[];
  prescriptions: EncounterRelatedPrescription[];
};

export type EncountersListMeta = {
  page: number;
  limit: number;
  total: number;
};
