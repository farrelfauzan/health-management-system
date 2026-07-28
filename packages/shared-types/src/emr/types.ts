import type { DiagnosisTypeValue, EncounterStatusValue } from '#emr/schemas';

export type EncounterRecord = {
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

export type UpdateEncounterRecordPayload = {
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
