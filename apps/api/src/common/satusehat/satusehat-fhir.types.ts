/**
 * Minimal FHIR R4 output shapes and domain-facing mapper inputs for the
 * SATUSEHAT adapter. These types are adapter internals: domain services hand
 * the mapper plain records and identifiers, and only the submission pipeline
 * ever sees the FHIR side. References are passed in as strings (either
 * `ResourceType/{ihs-id}` or a `urn:uuid:` bundle-local reference) so bundle
 * assembly stays with the caller.
 */
export type SatusehatFhirCoding = {
  system: string;
  code: string;
  display?: string;
};

export type SatusehatFhirCodeableConcept = {
  coding: SatusehatFhirCoding[];
};

export type SatusehatFhirReference = {
  reference: string;
  display?: string;
};

export type SatusehatFhirPeriod = {
  start: string;
  end?: string;
};

export type SatusehatFhirQuantity = {
  value: number;
  unit: string;
  system: string;
  code: string;
};

export type SatusehatFhirIdentifier = {
  system: string;
  use: string;
  value: string;
};

export type SatusehatEncounterStatusHistoryEntry = {
  status: 'arrived' | 'in-progress' | 'finished';
  period: SatusehatFhirPeriod;
};

export type SatusehatFhirEncounterDiagnosis = {
  condition: SatusehatFhirReference;
  use: SatusehatFhirCodeableConcept;
  rank: number;
};

export type SatusehatFhirEncounter = {
  resourceType: 'Encounter';
  identifier: SatusehatFhirIdentifier[];
  status: 'finished';
  class: SatusehatFhirCoding;
  subject: SatusehatFhirReference;
  participant: Array<{
    type: SatusehatFhirCodeableConcept[];
    individual: SatusehatFhirReference;
  }>;
  period: SatusehatFhirPeriod;
  location: Array<{ location: SatusehatFhirReference }>;
  statusHistory: SatusehatEncounterStatusHistoryEntry[];
  diagnosis?: SatusehatFhirEncounterDiagnosis[];
  serviceProvider: SatusehatFhirReference;
};

export type SatusehatFhirCondition = {
  resourceType: 'Condition';
  clinicalStatus: SatusehatFhirCodeableConcept;
  category: SatusehatFhirCodeableConcept[];
  code: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  recordedDate: string;
};

export type SatusehatFhirObservation = {
  resourceType: 'Observation';
  status: 'final';
  category: SatusehatFhirCodeableConcept[];
  code: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  effectiveDateTime: string;
  performer?: SatusehatFhirReference[];
  valueQuantity: SatusehatFhirQuantity;
};

export type SatusehatEncounterMapInput = {
  encounterId: string;
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber: string;
  practitionerName?: string;
  arrivedAt: Date;
  startedAt: Date;
  endedAt: Date;
  conditionReferences?: ReadonlyArray<{ reference: string; rank: number }>;
};

export type SatusehatConditionMapInput = {
  icd10Code: string;
  icd10Display: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  recordedAt: Date;
};

export type SatusehatVitalSignsMapInput = {
  patientIhsNumber: string;
  practitionerIhsNumber?: string;
  encounterReference: string;
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

export type SatusehatVitalSignField = keyof Pick<
  SatusehatVitalSignsMapInput,
  | 'heightCm'
  | 'weightKg'
  | 'systolicBloodPressure'
  | 'diastolicBloodPressure'
  | 'pulseRate'
  | 'respiratoryRate'
  | 'temperatureCelsius'
  | 'oxygenSaturation'
>;
