/**
 * Minimal FHIR R4 output shapes and domain-facing mapper inputs for the
 * SATUSEHAT adapter. These types are adapter internals: domain services hand
 * the mapper plain records and identifiers, and only the submission pipeline
 * ever sees the FHIR side. References are passed in as strings (either
 * `ResourceType/{ihs-id}` or a `urn:uuid:` bundle-local reference) so bundle
 * assembly stays with the caller.
 */
import type { SatusehatDischargeDisposition } from '@hms/shared-types';

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

/** One place a visit happened, over the period it happened there. */
export type SatusehatFhirEncounterLocation = {
  location: SatusehatFhirReference;
  period?: SatusehatFhirPeriod;
  extension?: SatusehatFhirExtension[];
};

export type SatusehatFhirEncounter = {
  resourceType: 'Encounter';
  identifier: SatusehatFhirIdentifier[];
  status: 'finished';
  class: SatusehatFhirCoding;
  subject: SatusehatFhirReference;
  /**
   * Omitted for a laboratory-only visit (P18-T10): nobody attended it, and an
   * Encounter naming a practitioner who never saw the patient is the fiction
   * that ticket exists to prevent.
   */
  participant?: Array<{
    type: SatusehatFhirCodeableConcept[];
    individual: SatusehatFhirReference;
  }>;
  serviceType?: SatusehatFhirCodeableConcept;
  period: SatusehatFhirPeriod;
  /**
   * One entry for an outpatient visit, and one per bed the patient occupied
   * for an inpatient stay (P24-T08) — each with the period it covers and the
   * service class the room was in.
   */
  location: SatusehatFhirEncounterLocation[];
  statusHistory: SatusehatEncounterStatusHistoryEntry[];
  hospitalization?: SatusehatFhirEncounterHospitalization;
  diagnosis?: SatusehatFhirEncounterDiagnosis[];
  /** Set on an antenatal visit, pointing at the pregnancy's episode (P25-T08). */
  episodeOfCare?: SatusehatFhirReference[];
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

/**
 * The set SATUSEHAT enforces on every Immunization (P24-T12): `recorded`,
 * `primarySource`, `reasonCode`, `protocolApplied`, `location`, and a
 * performer whose `function` matches `primarySource` — `AP` for a dose given
 * here, `EP` for one copied from a card. Lot and expiry are mandatory only for
 * a primary-source dose, which is why they stay optional here.
 */
export type SatusehatFhirImmunization = {
  resourceType: 'Immunization';
  identifier: SatusehatFhirIdentifier[];
  status: 'completed';
  vaccineCode: SatusehatFhirCodeableConcept;
  patient: SatusehatFhirReference;
  encounter: SatusehatFhirReference;
  occurrenceDateTime: string;
  recorded: string;
  primarySource: boolean;
  location: SatusehatFhirReference;
  lotNumber?: string;
  expirationDate?: string;
  site?: SatusehatFhirCodeableConcept;
  route?: SatusehatFhirCodeableConcept;
  reasonCode: SatusehatFhirCodeableConcept[];
  performer: Array<{ function: SatusehatFhirCodeableConcept; actor: SatusehatFhirReference }>;
  protocolApplied: Array<{ doseNumberPositiveInt: number }>;
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
  /** Used by the two antenatal date observations, HPHT and HPL (P25-T08). */
  valueDateTime?: string;
  valueCodeableConcept?: SatusehatFhirCodeableConceptWithText;
  /** The nifas findings the PNC playbook sends as present/absent (P25-T12). */
  valueBoolean?: boolean;
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
  /**
   * The beds the patient occupied, oldest first (P24-T08, FR-IP-01). Empty
   * for a stay whose assignments could not be read, which falls back to the
   * single root entry an outpatient visit uses.
   */
  beds: readonly SatusehatEncounterBedStay[];
  /** Already resolved from the recorded disposition and the stay's length. */
  dischargeDisposition: SatusehatDischargeDisposition;
};

/** One bed occupied during a stay, over the period it was occupied. */
export type SatusehatEncounterBedStay = {
  /** The bed's registered Location, or null when nobody has registered it. */
  locationId: string | null;
  /** `1`, `2`, `3`, `vip`, `vvip` — null when the room's class is unmapped. */
  serviceClassCode: string | null;
  startedAt: Date;
  /** Null while the patient is still in the bed; the stay's end is used. */
  endedAt: Date | null;
};

export type SatusehatEncounterMapInput = {
  encounterId: string;
  /**
   * The Location the visit reports under, already resolved by
   * `resolveSatusehatEncounterLocation` (P24-T07): the poli's own, else the
   * root site chain. Null hands the decision back to `SATUSEHAT_LOCATION_ID`,
   * which is also what a caller that resolved nothing at all passes — the
   * mapper then refuses, exactly as it did before a poli could be named.
   */
  locationId: string | null;
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber: string;
  practitionerName?: string;
  arrivedAt: Date;
  startedAt: Date;
  endedAt: Date;
  admission?: SatusehatEncounterAdmission;
  conditionReferences?: ReadonlyArray<{ reference: string; rank: number }>;
  /**
   * Set when this visit is an antenatal one (P25-T08). The episode id adds an
   * `episodeOfCare` reference; the K code adds a second identifier beside the
   * encounter's own. Order does not matter to the platform and the K code may
   * be absent, so a visit recorded without one is simply reported without it.
   */
  antenatalEpisode?: { satusehatEpisodeOfCareId: string; visitCode: string | null };
  /**
   * Set when this visit is a nifas or neonatal one (P25-T12). The episode id —
   * a nifas visit's PNC episode, null for a baby's visit, whose neonatal
   * episode is not sent — adds an `episodeOfCare` reference; the visit
   * identifier (KF under `…/puerperium`, KN under `…/neonate`) is added beside
   * the encounter's own.
   */
  postnatalEpisode?: {
    satusehatEpisodeOfCareId: string | null;
    visitIdentifier: { system: string; value: string } | null;
  };
};

/** What {@link SatusehatPostnatalMapper.mapPostnatalEpisodeOfCare} needs (P25-T12). */
export type SatusehatPostnatalEpisodeMapInput = {
  pregnancyEpisodeId: string;
  patientIhsNumber: string;
  patientName?: string;
  /** `EpisodeOfCare.period.start` — the birth. */
  startedAt: Date;
};

/** What {@link SatusehatPostnatalMapper.mapPostnatalObservations} needs (P25-T12). */
export type SatusehatPostnatalObservationMapInput = {
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber?: string;
  encounterReference: string;
  recordedAt: Date;
  values: Readonly<
    Partial<Record<SatusehatPostnatalObservationField, number | string | boolean | Date>>
  >;
};

/** What {@link SatusehatFhirMapper.mapAntenatalEpisodeOfCare} needs (P25-T08). */
export type SatusehatAntenatalEpisodeMapInput = {
  pregnancyEpisodeId: string;
  patientIhsNumber: string;
  patientName?: string;
  /** `EpisodeOfCare.period.start` — HPHT when known, else the first visit. */
  startedAt: Date;
};

/** What closing one episode needs (P25-T08). */
export type SatusehatAntenatalEpisodeFinishMapInput = {
  patientIhsNumber: string;
  startedAt: Date;
  endedAt: Date;
};

/** What {@link SatusehatFhirMapper.mapAntenatalObservations} needs (P25-T08). */
export type SatusehatAntenatalObservationMapInput = {
  patientIhsNumber: string;
  patientName?: string;
  practitionerIhsNumber?: string;
  encounterReference: string;
  recordedAt: Date;
  values: Readonly<Partial<Record<SatusehatAntenatalObservationField, number | string | Date>>>;
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

export type SatusehatImmunizationReasonCode =
  | 'IM_DASAR'
  | 'IM_BADUTA'
  | 'IM_SD'
  | 'IM_WUS'
  | 'IM_TAMBAHAN'
  | 'IM_KHUSUS'
  | 'IM_PILIHAN';

export type SatusehatImmunizationMapInput = {
  immunizationId: string;
  kfaCode: string;
  vaccineName: string;
  patientIhsNumber: string;
  patientName?: string;
  encounterReference: string;
  occurredAt: Date;
  /** When the row was written down — `Immunization.recorded`, not the dose time. */
  recordedAt: Date;
  /**
   * A dose copied from a card or KIA book: reported as not primary-source with
   * an entering performer, and without lot or expiry (P24-T12, FR-IM-02).
   */
  isHistorical: boolean;
  lotNumber?: string;
  /** Calendar date, `YYYY-MM-DD` — an expiry has no time and no timezone. */
  expirationDate?: string;
  doseNumber: number;
  reason: SatusehatImmunizationReasonCode;
  route?: 'IM' | 'SC' | 'ID' | 'ORAL' | 'NASAL';
  site?: 'LEFT_ARM' | 'RIGHT_ARM' | 'LEFT_THIGH' | 'RIGHT_THIGH' | 'OTHER';
  performerIhsNumber: string;
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
/**
 * A visit that exists only so a specimen could be taken (P18-T10). The chain
 * still needs an Encounter to reference, so one is sent inside the same bundle
 * — ambulatory, laboratory, performed by the Organization, and attended by
 * nobody.
 */
export type SatusehatLabOnlyEncounterMapInput = {
  registrationId: string;
  /**
   * The root site Location (P24-T07). A blood draw belongs to no poli, so this
   * is never a specialty's Location; null falls back to
   * `SATUSEHAT_LOCATION_ID` as before.
   */
  locationId: string | null;
  patientIhsNumber: string;
  patientName?: string;
  startedAt: Date;
  endedAt: Date;
};

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

/**
 * One FHIR extension, either simple (a value) or complex (named
 * sub-extensions). The inpatient service class uses both shapes: a Location
 * carries the class alone, while an `Encounter.location` entry carries it
 * beside an upgrade indicator (P24-T06, P24-T08).
 */
export type SatusehatFhirExtension = {
  url: string;
  valueCodeableConcept?: SatusehatFhirCodeableConcept;
  extension?: SatusehatFhirExtension[];
};

/**
 * One `url`/`valueCode` pair inside the Kemenkes `administrativeCode`
 * extension (`province`, `city`, `district`, `village`, `rt`, `rw`).
 */
export type SatusehatFhirAdministrativeCodeEntry = {
  url: 'province' | 'city' | 'district' | 'village' | 'rt' | 'rw';
  valueCode: string;
};

export type SatusehatFhirAdministrativeCodeExtension = {
  url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode';
  extension: SatusehatFhirAdministrativeCodeEntry[];
};

/**
 * A FHIR R4 `Address` as SATUSEHAT's Patient profile wants it (P19-T10): the
 * street in `line`, the regency name in `city`, and the Kemendagri codes in
 * the `administrativeCode` extension — present only when the patient record
 * carries a structured address.
 */
export type SatusehatFhirAddress = {
  use: 'home';
  line: string[];
  city?: string;
  postalCode?: string;
  country: 'ID';
  extension?: SatusehatFhirAdministrativeCodeExtension[];
};

/**
 * What the mapper needs to post one newborn (P24-T11). The address is the
 * mother's, read off her record by the caller; absent when she has none.
 */
export type SatusehatNewbornPatientMapInput = {
  motherNik: string;
  fullName: string;
  sex: 'MALE' | 'FEMALE';
  birthDate: string;
  multipleBirthInteger: number;
  address?: SatusehatPatientAddressMapInput;
};

/**
 * A newborn as the master patient index receives her (P24-T11, FR-NB-03).
 *
 * The identifier is her **mother's** NIK under the `nik-ibu` system: a baby
 * has none of her own for weeks, and this is how the platform holds her until
 * she does. `multipleBirthInteger` is her birth order, which is what tells her
 * from a sibling born the same day.
 */
export type SatusehatFhirNewbornPatient = {
  resourceType: 'Patient';
  active: true;
  identifier: Array<{ system: string; use: 'official'; value: string }>;
  name: Array<{ use: 'official'; text: string }>;
  gender: 'male' | 'female';
  birthDate: string;
  multipleBirthInteger: number;
  address?: SatusehatFhirAddress[];
};

/**
 * One RFC 6902 JSON Patch operation, which is the body shape the platform's
 * `PATCH /Patient/{id}` takes — `[{ "op", "path", "value" }]`, sent as
 * `application/json` (MPI ReST API reference, read 2026-09-20).
 */
export type SatusehatFhirJsonPatchOperation = {
  op: 'add' | 'replace';
  path: string;
  value: unknown;
};

/**
 * What the mapper needs to turn a newborn's first NIK into a patch (P24-T13).
 * The name and birth date travel with it because Dukcapil validates all three
 * together, not the NIK on its own.
 */
export type SatusehatNewbornNikPatchMapInput = {
  nik: string;
  fullName: string;
  birthDate: string;
};

/**
 * What the mapper needs to build a patient's FHIR address: the street line
 * plus whatever of the structured address (P19-T10) the record holds. Codes
 * are the dotted Kemendagri form the registry stores; the mapper strips the
 * dots, which is how SATUSEHAT spells them.
 */
export type SatusehatPatientAddressMapInput = {
  street: string;
  provinceCode?: string | null;
  regencyCode?: string | null;
  regencyName?: string | null;
  districtCode?: string | null;
  villageCode?: string | null;
  rtRw?: string | null;
  postalCode?: string | null;
};

export type SatusehatFhirSimpleQuantity = {
  value: number;
  unit?: string;
};

/**
 * A prescribed or dispensed amount: fully coded as an orderable drug form, or
 * a bare number when the catalog unit has no dose-form code — never an
 * uncoded unit. Unverified against the gateway: a bare lab quantity was
 * rejected as "Invalid coding system", so the bare form may fail here too.
 */
export type SatusehatFhirCodedOrBareQuantity =
  | SatusehatFhirQuantity
  | { value: number; unit?: never; system?: never; code?: never };

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
  dispenseRequest: { quantity: SatusehatFhirCodedOrBareQuantity };
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
  quantity: SatusehatFhirCodedOrBareQuantity;
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
  /** 0..1 in R4 — a single object; an array makes the bundle unparseable. */
  identifier: SatusehatFhirIdentifier;
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
 * The part of a rejection body the HTTP client reads to explain it: the
 * OperationOutcome's issue texts, each naming one broken rule and element.
 */
export type SatusehatOperationOutcome = {
  readonly issue?: ReadonlyArray<{
    readonly diagnostics?: unknown;
    readonly details?: { readonly text?: unknown };
  }>;
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
  prescriptionId: string;
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

/** One fixed-unit vital-sign column and the LOINC/UCUM coding it is sent under. */
export type SatusehatVitalSignDefinition = {
  field: SatusehatVitalSignField;
  loincCode: string;
  loincDisplay: string;
  unit: string;
  ucumCode: string;
};

/** The antenatal measurements that carry a coding (P25-T08). */
export type SatusehatAntenatalObservationField =
  | 'gravida'
  | 'para'
  | 'abortus'
  | 'lastMenstrualPeriodDate'
  | 'estimatedDeliveryDate'
  | 'prePregnancyWeightKg'
  | 'gestationalAgeWeeks'
  | 'trimester'
  | 'muacCm'
  | 'fundalHeightCm'
  | 'bloodType'
  | 'rhesus'
  | 'fetalHeartRateBpm'
  | 'fetalHeadEngagement'
  | 'estimatedFetalWeightGrams'
  | 'fetalPresentation'
  | 'fetalCount';

/**
 * How one antenatal measurement is coded, and the unit it is sent in when it
 * is a quantity (P25-T08). `unit` and `ucumCode` are absent together for the
 * measurements sent as a date or a string.
 */
export type SatusehatAntenatalObservationDefinition = {
  system: string;
  code: string;
  display: string;
  category: 'survey' | 'exam' | 'vital-signs' | 'laboratory';
  unit?: string;
  ucumCode?: string;
};

/** The nifas findings that carry a coding (P25-T12). */
export type SatusehatPostnatalObservationField =
  | 'deliveryDate'
  | 'vaginalBleeding'
  | 'bloodLossMl'
  | 'perineumCondition'
  | 'perinealInfectionSigns'
  | 'caesareanWoundInfectionSigns'
  | 'breastCondition'
  | 'uterineContraction'
  | 'lochiaColour'
  | 'lochiaOdour'
  | 'breastMilkProduction'
  | 'urination'
  | 'defecation';

/** One coded answer — a local enum value's SNOMED or `clinical-term` coding. */
export type SatusehatCodedAnswer = {
  system: string;
  code: string;
  display: string;
};

/**
 * How one nifas finding is coded (P25-T12). `answers` is set for a finding
 * sent as a CodeableConcept, keyed by the local enum value; `unit` and
 * `ucumCode` for a quantity. A boolean, a string or a date needs neither.
 */
export type SatusehatPostnatalObservationDefinition = {
  system: string;
  code: string;
  display: string;
  category: 'survey' | 'exam';
  unit?: string;
  ucumCode?: string;
  answers?: Readonly<Record<string, SatusehatCodedAnswer>>;
};

/** A FHIR EpisodeOfCare as SATUSEHAT accepts it (P25-T08). */
export type SatusehatFhirEpisodeOfCare = {
  resourceType: 'EpisodeOfCare';
  id?: string;
  identifier: SatusehatFhirIdentifier[];
  status: 'active' | 'finished';
  type: SatusehatFhirCodeableConcept[];
  patient: SatusehatFhirReference;
  managingOrganization: SatusehatFhirReference;
  period: { start: string; end?: string };
  statusHistory?: { status: 'active' | 'finished'; period: { start: string; end?: string } }[];
};

/**
 * One RFC 6902 operation. The gateway takes a patch as an operation list and
 * validates the list alone, so the list the close sends always carries the
 * patient as well as the change (P25-T08).
 */
export type SatusehatJsonPatchOperation = {
  op: 'add' | 'replace';
  path: string;
  value: unknown;
};

/** A FHIR Location as SATUSEHAT accepts it (P24-T06). */
export type SatusehatFhirLocation = {
  resourceType: 'Location';
  id?: string;
  identifier: { system: string; value: string }[];
  status: 'active' | 'inactive';
  name: string;
  mode: 'instance';
  physicalType: SatusehatFhirCodeableConcept;
  position?: { longitude: number; latitude: number; altitude: number };
  managingOrganization: SatusehatFhirReference;
  partOf?: SatusehatFhirReference;
  extension?: SatusehatFhirExtension[];
};

/**
 * What the Location builder needs for one clinic row (P24-T06). `parent` is
 * null for the root site only; `serviceClassCode` is set for rooms and beds.
 */
export type SatusehatLocationResourceInput = {
  organizationId: string;
  localId: string;
  satusehatLocationId: string | null;
  physicalTypeCode: 'si' | 'ro' | 'wa' | 'bd';
  name: string;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  parent: { satusehatLocationId: string; name: string } | null;
  serviceClassCode: string | null;
};
