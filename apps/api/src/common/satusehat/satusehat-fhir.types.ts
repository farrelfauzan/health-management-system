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

export type SatusehatFhirExtension = {
  url: string;
  valueCodeableConcept: SatusehatFhirCodeableConcept;
};

export type SatusehatFhirSimpleQuantity = {
  value: number;
  unit?: string;
};

export type SatusehatFhirMedication = {
  resourceType: 'Medication';
  identifier: SatusehatFhirIdentifier[];
  status: 'active';
  code: SatusehatFhirCodeableConcept;
  extension: SatusehatFhirExtension[];
};

export type SatusehatFhirMedicationRequest = {
  resourceType: 'MedicationRequest';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  intent: 'order';
  medicationReference: SatusehatFhirReference;
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  requester: SatusehatFhirReference;
  authoredOn?: string;
  dosageInstruction: Array<{ sequence: number; text: string }>;
  dispenseRequest: { quantity: SatusehatFhirSimpleQuantity };
  substitution: { allowedBoolean: boolean };
};

export type SatusehatFhirMedicationDispense = {
  resourceType: 'MedicationDispense';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  medicationReference: SatusehatFhirReference;
  subject: SatusehatFhirReference;
  context: SatusehatFhirReference;
  performer: Array<{ actor: SatusehatFhirReference }>;
  authorizingPrescription?: SatusehatFhirReference[];
  quantity: SatusehatFhirSimpleQuantity;
  whenHandedOver: string;
  substitution: { wasSubstituted: boolean };
};

export type SatusehatFhirBundleEntry = {
  fullUrl: string;
  resource:
    | SatusehatFhirEncounter
    | SatusehatFhirCondition
    | SatusehatFhirObservation
    | SatusehatFhirMedication
    | SatusehatFhirMedicationRequest
    | SatusehatFhirMedicationDispense;
  request: { method: 'POST'; url: string };
};

export type SatusehatFhirTransactionBundle = {
  resourceType: 'Bundle';
  type: 'transaction';
  entry: SatusehatFhirBundleEntry[];
};

export type SatusehatTransactionResponseEntry = {
  readonly response?: {
    readonly status?: unknown;
    readonly location?: unknown;
  };
  readonly resource?: {
    readonly resourceType?: unknown;
    readonly id?: unknown;
  };
};

export type SatusehatTransactionResponse = {
  readonly entry?: readonly SatusehatTransactionResponseEntry[];
};

export type SatusehatMedicationMapInput = {
  medicationCode: string;
  kfaCode: string;
  name: string;
};

export type SatusehatMedicationRequestMapInput = {
  prescriptionId: string;
  prescriptionItemId: string;
  medicationReference: string;
  medicationDisplay: string;
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber: string;
  practitionerName?: string;
  encounterReference: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  quantity: number;
  unit?: string;
  authoredOn?: Date;
};

export type SatusehatMedicationDispenseMapInput = {
  dispenseRecordId: string;
  dispenseItemId: string;
  medicationReference: string;
  medicationDisplay: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  medicationRequestReference?: string;
  quantity: number;
  unit?: string;
  dispensedAt: Date;
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
