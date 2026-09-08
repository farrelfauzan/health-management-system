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

/** A concept whose human-readable text is required alongside optional codes. */
export type SatusehatFhirCodeableConceptWithText = {
  coding?: SatusehatFhirCoding[];
  text: string;
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

export type SatusehatFhirEncounterHospitalization = {
  dischargeDisposition: SatusehatFhirCodeableConcept;
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
  hospitalization?: SatusehatFhirEncounterHospitalization;
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

export type SatusehatFhirAnnotation = {
  text: string;
};

export type SatusehatFhirProcedure = {
  resourceType: 'Procedure';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  code: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  performedPeriod: SatusehatFhirPeriod;
  performer?: Array<{ actor: SatusehatFhirReference }>;
  note?: SatusehatFhirAnnotation[];
};

export type SatusehatFhirAllergyReaction = {
  description: string;
};

export type SatusehatFhirAllergyIntolerance = {
  resourceType: 'AllergyIntolerance';
  identifier: SatusehatFhirIdentifier[];
  clinicalStatus: SatusehatFhirCodeableConcept;
  verificationStatus: SatusehatFhirCodeableConcept;
  code: SatusehatFhirCodeableConceptWithText;
  criticality: 'low' | 'high';
  patient: SatusehatFhirReference;
  encounter?: SatusehatFhirReference;
  recordedDate: string;
  recorder?: SatusehatFhirReference;
  reaction?: SatusehatFhirAllergyReaction[];
};

export type SatusehatFhirImmunization = {
  resourceType: 'Immunization';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  vaccineCode: SatusehatFhirCodeableConcept;
  patient: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  occurrenceDateTime: string;
  lotNumber?: string;
  expirationDate?: string;
  site?: SatusehatFhirCodeableConcept;
  route?: SatusehatFhirCodeableConcept;
  performer?: Array<{ actor: SatusehatFhirReference }>;
  protocolApplied?: Array<{ doseNumberPositiveInt: number }>;
  note?: SatusehatFhirAnnotation[];
};

/**
 * One measurement. Serves both the vital-sign observations of the encounter
 * bundle and the laboratory observations of the lab chain (P18-T09), which is
 * why so much of it is optional: a vital sign is always a quantity taken
 * during a visit, while a lab result may be text or a coded value, carries a
 * reference range and an interpretation, and names the tube it came from.
 *
 * `amended` is a lab-only status — a corrected value supersedes one already
 * reported, and the platform is told so rather than being sent a second
 * `final` for the same test.
 */
export type SatusehatFhirObservation = {
  resourceType: 'Observation';
  status: 'final' | 'amended';
  identifier?: SatusehatFhirIdentifier[];
  category: SatusehatFhirCodeableConcept[];
  code: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  encounter?: SatusehatFhirReference;
  basedOn?: SatusehatFhirReference[];
  specimen?: SatusehatFhirReference;
  effectiveDateTime: string;
  /** When the value was released — the moment it became clinically usable. */
  issued?: string;
  performer?: SatusehatFhirReference[];
  /** Exactly one of the three value forms is set, decided by the test. */
  valueQuantity?: SatusehatFhirQuantity;
  valueString?: string;
  valueCodeableConcept?: SatusehatFhirCodeableConceptWithText;
  interpretation?: SatusehatFhirCodeableConcept[];
  referenceRange?: SatusehatFhirObservationReferenceRange[];
};

/**
 * The band this patient's value was judged against, snapshotted onto the
 * result when it was entered. `text` alone is sent for a qualitative range
 * ("negatif"), where there is no number to bound.
 */
export type SatusehatFhirObservationReferenceRange = {
  low?: SatusehatFhirQuantity;
  high?: SatusehatFhirQuantity;
  text?: string;
};

/**
 * One ordered test (P18-T09). One per item rather than one per order: a
 * ServiceRequest carries the LOINC of a single test, so a request for Darah
 * rutin + GDS is six of these.
 */
export type SatusehatFhirServiceRequest = {
  resourceType: 'ServiceRequest';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  intent: 'original-order';
  category: SatusehatFhirCodeableConcept[];
  code: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  occurrenceDateTime: string;
  requester?: SatusehatFhirReference;
  performer?: SatusehatFhirReference[];
  reasonCode?: SatusehatFhirCodeableConcept[];
};

/** One tube, and the requests it serves (P18-T09). */
export type SatusehatFhirSpecimen = {
  resourceType: 'Specimen';
  identifier?: SatusehatFhirIdentifier[];
  accessionIdentifier?: SatusehatFhirIdentifier;
  status: 'available';
  type?: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  request?: SatusehatFhirReference[];
  collection?: SatusehatFhirSpecimenCollection;
};

export type SatusehatFhirSpecimenCollection = {
  collectedDateTime: string;
};

/**
 * The sheet the whole order becomes (P18-T09) — one per order, gathering the
 * observations, the tubes they came from and the requests that asked for them.
 */
export type SatusehatFhirDiagnosticReport = {
  resourceType: 'DiagnosticReport';
  identifier: SatusehatFhirIdentifier[];
  status: 'final' | 'amended';
  category: SatusehatFhirCodeableConcept[];
  code: SatusehatFhirCodeableConcept;
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  basedOn?: SatusehatFhirReference[];
  specimen?: SatusehatFhirReference[];
  result?: SatusehatFhirReference[];
  effectiveDateTime: string;
  issued: string;
  performer?: SatusehatFhirReference[];
  conclusion?: string;
};

/**
 * The inpatient stay an encounter belongs to, when it has one. Its presence is
 * what makes the visit `IMP` rather than `AMB`, and its timestamps bound the
 * reported period — the episode ends at discharge, not when the doctor closed
 * the note.
 */
export type SatusehatEncounterAdmission = {
  admittedAt: Date;
  dischargedAt: Date;
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
  admission?: SatusehatEncounterAdmission;
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

/**
 * Input for one ICD-9-CM-coded procedure. `performedAt` is clamped into the
 * encounter period by the caller-supplied bounds the same way check-in is
 * clamped in `mapEncounter`: the platform rejects a period that falls outside
 * the visit it references.
 */
export type SatusehatProcedureMapInput = {
  procedureId: string;
  icd9cmCode: string;
  icd9cmDisplay: string;
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber?: string;
  practitionerName?: string;
  encounterReference: string;
  performedAt: Date;
  encounterStartedAt: Date;
  encounterEndedAt: Date;
  notes?: string;
};

/**
 * Input for one recorded allergy. `recorderIhsNumber` is supplied only when
 * the row was written during this encounter's window — naming the attending
 * doctor as recorder of an allergy somebody else took down years ago would put
 * a false attribution in the national record.
 */
export type SatusehatAllergyMapInput = {
  allergyId: string;
  substance: string;
  reaction?: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  patientIhsNumber: string;
  patientName?: string;
  encounterReference?: string;
  recordedAt: Date;
  recorderIhsNumber?: string;
  recorderName?: string;
};

export type SatusehatImmunizationMapInput = {
  immunizationId: string;
  kfaCode: string;
  vaccineName: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  occurredAt: Date;
  lotNumber?: string;
  /** Calendar date, `YYYY-MM-DD` — an expiry has no time and no timezone. */
  expirationDate?: string;
  doseNumber?: number;
  route?: 'IM' | 'SC' | 'ID' | 'ORAL' | 'NASAL';
  site?: 'LEFT_ARM' | 'RIGHT_ARM' | 'LEFT_THIGH' | 'RIGHT_THIGH' | 'OTHER';
  performerIhsNumber?: string;
  performerName?: string;
  notes?: string;
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

/**
 * One ordered test, ready to be coded as a ServiceRequest (P18-T09). The
 * caller has already skipped items without a LOINC, so `loincCode` is
 * required here: an uncoded request is gap-reported, never sent.
 */
export type SatusehatServiceRequestMapInput = {
  orderNumber: string;
  itemSeq: number;
  loincCode: string;
  loincDisplay?: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  orderedAt: Date;
  /** Omitted for an order whose requester holds no IHS practitioner number. */
  practitionerIhsNumber?: string;
  reasonCode?: string;
  reasonDisplay?: string;
};

export type SatusehatSpecimenMapInput = {
  specimenType: 'WHOLE_BLOOD' | 'SERUM' | 'PLASMA' | 'URINE' | 'STOOL' | 'SPUTUM' | 'SWAB' | 'OTHER';
  accessionNumber: string;
  collectedAt: Date;
  patientIhsNumber: string;
  patientName?: string;
  /** Bundle-local `urn:uuid:` references to the requests this tube serves. */
  serviceRequestReferences: readonly string[];
};

/**
 * One released laboratory value (P18-T09). Exactly one of the three value
 * fields is set, decided by the test's result type; the mapper trusts that and
 * does not guess.
 */
export type SatusehatLabObservationMapInput = {
  loincCode: string;
  loincDisplay?: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  serviceRequestReference: string;
  /** Omitted while the item has no tube — a sent-out test, or a rejected draw. */
  specimenReference?: string;
  valueNumeric?: number;
  valueString?: string;
  valueCoded?: string;
  /** UCUM, and only meaningful beside `valueNumeric`. */
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
  flag?: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'ABNORMAL';
  /** True once this value supersedes one already reported. */
  isAmendment: boolean;
  effectiveAt: Date;
  issuedAt: Date;
};

export type SatusehatDiagnosticReportMapInput = {
  orderNumber: string;
  /**
   * The panel's LOINC when the whole order was one panel. Omitted otherwise,
   * and the report codes as a generic laboratory report instead.
   */
  panelLoincCode?: string;
  panelLoincDisplay?: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  serviceRequestReferences: readonly string[];
  specimenReferences: readonly string[];
  observationReferences: readonly string[];
  isAmendment: boolean;
  effectiveAt: Date;
  issuedAt: Date;
  conclusion?: string;
};

export type SatusehatFhirExtension = {
  url: string;
  valueCodeableConcept: SatusehatFhirCodeableConcept;
};

export type SatusehatFhirSimpleQuantity = {
  value: number;
  unit?: string;
};

export type SatusehatFhirMedicationIngredient = {
  itemReference: SatusehatFhirReference;
  strength?: {
    numerator: SatusehatFhirSimpleQuantity;
    denominator: SatusehatFhirSimpleQuantity;
  };
};

export type SatusehatFhirMedication = {
  resourceType: 'Medication';
  identifier: SatusehatFhirIdentifier[];
  status: 'active';
  /**
   * A catalog product carries a KFA coding. A compound the clinic mixed itself
   * has no national code to carry, so it goes out as `text` — which is what
   * FHIR provides for exactly this (P10-T18).
   */
  code: SatusehatFhirCodeableConcept & { text?: string };
  extension: SatusehatFhirExtension[];
  /** Present only on a compound (type SD): its ingredients, one per entry. */
  ingredient?: SatusehatFhirMedicationIngredient[];
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

export type SatusehatFhirNarrative = {
  status: 'generated';
  div: string;
};

export type SatusehatFhirCompositionSection = {
  title: string;
  code?: SatusehatFhirCodeableConcept;
  text?: SatusehatFhirNarrative;
  entry?: SatusehatFhirReference[];
};

export type SatusehatFhirComposition = {
  resourceType: 'Composition';
  identifier: SatusehatFhirIdentifier[];
  status: 'final';
  type: SatusehatFhirCodeableConcept;
  category: SatusehatFhirCodeableConcept[];
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  date: string;
  author: SatusehatFhirReference[];
  title: string;
  custodian: SatusehatFhirReference;
  section: SatusehatFhirCompositionSection[];
};

export type SatusehatFhirClinicalImpression = {
  resourceType: 'ClinicalImpression';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  subject: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  effectiveDateTime: string;
  assessor: SatusehatFhirReference;
  summary?: string;
  finding?: Array<{ itemReference: SatusehatFhirReference }>;
  prognosisCodeableConcept?: SatusehatFhirCodeableConceptWithText[];
};

/**
 * One Composition section as the submission service assembles it: a title, an
 * optional LOINC code, the narrative text that belongs in it, and the
 * bundle-local references it points at. A section with neither narrative nor
 * entries is dropped rather than sent blank (P10-T15).
 */
export type SatusehatCompositionSectionInput = {
  title: string;
  loincCode?: string;
  loincDisplay?: string;
  narrative?: string;
  entryReferences?: readonly string[];
};

export type SatusehatCompositionMapInput = {
  encounterId: string;
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber: string;
  practitionerName?: string;
  encounterReference: string;
  endedAt: Date;
  sections: readonly SatusehatCompositionSectionInput[];
};

export type SatusehatClinicalImpressionPrognosis =
  | 'BONAM'
  | 'DUBIA_AD_BONAM'
  | 'DUBIA_AD_MALAM'
  | 'MALAM';

export type SatusehatClinicalImpressionMapInput = {
  encounterId: string;
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber: string;
  practitionerName?: string;
  encounterReference: string;
  endedAt: Date;
  summary?: string;
  findingReferences?: readonly string[];
  prognosis?: SatusehatClinicalImpressionPrognosis;
};

export type SatusehatFhirBundleEntry = {
  fullUrl: string;
  resource:
    | SatusehatFhirEncounter
    | SatusehatFhirCondition
    | SatusehatFhirProcedure
    | SatusehatFhirImmunization
    | SatusehatFhirAllergyIntolerance
    | SatusehatFhirObservation
    | SatusehatFhirServiceRequest
    | SatusehatFhirSpecimen
    | SatusehatFhirDiagnosticReport
    | SatusehatFhirComposition
    | SatusehatFhirClinicalImpression
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

/**
 * One resource created by a transaction bundle, as parsed from the
 * corresponding response entry's `location`. Keyed back to the request entry's
 * `fullUrl` so callers can write the returned id onto the row that produced it
 * (P10-T08's allergy write-back, P10-T09's encounter provenance).
 */
export type SatusehatCreatedResourceLocation = {
  resourceType: string;
  id: string;
};

export type SatusehatMedicationMapInput = {
  medicationCode: string;
  kfaCode: string;
  name: string;
};

/**
 * A compounded medication (racikan, P10-T18). Each ingredient references a
 * bundle-local `Medication` entry for the component product, which is why the
 * caller passes references rather than codes — assembly stays with the caller,
 * as it does for every other mapper here.
 */
export type SatusehatCompoundMedicationMapInput = {
  prescriptionItemId: string;
  compoundName: string;
  ingredients: ReadonlyArray<{
    medicationReference: string;
    medicationDisplay: string;
    quantity: number;
    unit: string;
  }>;
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
