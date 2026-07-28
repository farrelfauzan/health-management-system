import type { DiagnosisTypeValue, EncounterStatusValue } from '#emr/schemas';
import type { PrescriptionStatusValue } from '#pharmacy-flow/schemas';
import type { RegistrationStatusValue } from '#registration-flow/schemas';

/**
 * The narrative half of an encounter record. Free text by design: the coded
 * conclusions live in `DiagnosisRecord` (ICD-10) and `ProcedureRecord`
 * (ICD-9-CM), and forcing clinical reasoning into codes loses the detail a
 * later reader needs.
 */
export type SoapNote = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
};

export type EncounterRecord = SoapNote & {
  id: string;
  registrationId: string;
  patientId: string;
  doctorId: string;
  status: EncounterStatusValue;
  startedAt: Date;
  endedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEncounterRecordPayload = {
  registrationId: string;
  patientId: string;
  doctorId: string;
  createdById: string;
};

export type UpdateEncounterRecordPayload = Partial<SoapNote> & {
  id: string;
  status?: EncounterStatusValue;
  endedAt?: Date;
};

/**
 * The measured values of one vital-signs set. Every field is optional: a front
 * desk records weight and blood pressure, a full set appears only when
 * clinically indicated. Decimal columns surface as numbers — the repository
 * converts at the Prisma boundary so no Decimal type escapes into the domain.
 */
export type VitalSignsMeasurements = {
  heightCm: number | null;
  weightKg: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  pulseRate: number | null;
  respiratoryRate: number | null;
  temperatureCelsius: number | null;
  oxygenSaturation: number | null;
};

export type VitalSignsRecord = VitalSignsMeasurements & {
  id: string;
  encounterId: string;
  notes: string | null;
  recordedAt: Date;
  recordedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateVitalSignsRecordPayload = Partial<VitalSignsMeasurements> & {
  encounterId: string;
  notes?: string;
  recordedAt?: Date;
  recordedById: string;
};

/**
 * `code` and `display` are the snapshot the clinician signed, not a join onto
 * the catalog: renaming or retiring an `Icd10Code` row must never rewrite a
 * signed record, so `icd10CodeId` is only the (nullable) provenance link.
 */
export type DiagnosisRecord = {
  id: string;
  encounterId: string;
  icd10CodeId: string | null;
  code: string;
  display: string;
  type: DiagnosisTypeValue;
  notes: string | null;
  recordedAt: Date;
  recordedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDiagnosisRecordPayload = {
  encounterId: string;
  icd10CodeId?: string;
  code: string;
  display: string;
  type: DiagnosisTypeValue;
  notes?: string;
  recordedById: string;
};

/**
 * A coded action performed during the encounter. `code` and `display` are the
 * signed snapshot for the same reason they are on `DiagnosisRecord`;
 * `icd9cmCodeId` is only provenance.
 */
export type ProcedureRecord = {
  id: string;
  encounterId: string;
  icd9cmCodeId: string | null;
  code: string;
  display: string;
  notes: string | null;
  performedAt: Date;
  recordedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProcedureRecordPayload = {
  encounterId: string;
  icd9cmCodeId?: string;
  code: string;
  display: string;
  notes?: string;
  performedAt?: Date;
  recordedById: string;
};

/**
 * Closes an encounter and moves its registration in the same transaction: the
 * clinical record and the front-desk state describe one visit, and a crash
 * between the two writes would leave a finished encounter queued as still
 * being seen.
 */
export type CloseEncounterRecordPayload = {
  id: string;
  registrationId: string;
  status: Extract<EncounterStatusValue, 'CANCELLED' | 'FINISHED'>;
  registrationStatus: Extract<RegistrationStatusValue, 'CANCELLED' | 'COMPLETED'>;
  endedAt: Date;
};

export type ListEncountersParams = {
  page: number;
  limit: number;
  status?: EncounterStatusValue;
  patientId?: string;
  doctorId?: string;
  registrationId?: string;
  startedFrom?: Date;
  startedTo?: Date;
  ownerUserId?: string;
};

export type EncounterRelatedPatientRecord = {
  id: string;
  mrn: string;
  fullName: string;
  ownerUserId: string | null;
};

export type EncounterRelatedDoctorRecord = {
  id: string;
  licenseNumber: string;
  fullName: string;
  ownerUserId: string | null;
};

export type EncounterChildCounts = {
  vitalSigns: number;
  diagnoses: number;
  procedures: number;
};

export type EncounterWithRelationsRecord = EncounterRecord & {
  patient: EncounterRelatedPatientRecord;
  doctor: EncounterRelatedDoctorRecord;
  _count: EncounterChildCounts;
};

export type EncounterPrescriptionRecord = {
  id: string;
  status: PrescriptionStatusValue;
  issuedAt: Date | null;
  _count: { items: number };
};

export type EncounterDetailRecord = EncounterRecord & {
  patient: EncounterRelatedPatientRecord;
  doctor: EncounterRelatedDoctorRecord;
  vitalSigns: VitalSignsRecord[];
  diagnoses: DiagnosisRecord[];
  procedures: ProcedureRecord[];
  prescriptions: EncounterPrescriptionRecord[];
};

/**
 * The registration an encounter may be opened from, with the patient owner
 * needed to answer "is this my own record?" without a second query.
 */
export type EncounterSourceRegistrationRecord = {
  id: string;
  patientId: string;
  status: RegistrationStatusValue;
  patient: { id: string; ownerUserId: string | null; isActive: boolean };
};
