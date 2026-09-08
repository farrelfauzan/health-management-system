import type {
  LabResultFlagValue,
  LabSpecimenTypeValue,
} from '#laboratory/schemas';
import type {
  SatusehatSubmissionKindValue,
  SatusehatSubmissionStatusValue,
} from '#satusehat/schemas';

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

/**
 * Who and what a refused link attempt is recorded against (P10-T10). The NIK
 * is deliberately absent: the audit trail names the profile, never the
 * identifier that failed to disambiguate.
 */
export type SatusehatLinkAuditTarget = {
  resource: string;
  resourceId: string;
  actorUserId: string;
};

export type SatusehatSubmissionRecord = {
  id: string;
  /** Which chain this row reports; decides the branch that builds its bundle. */
  kind: SatusehatSubmissionKindValue;
  /** Set on ENCOUNTER rows only — a lab report reaches its encounter by order. */
  encounterId: string | null;
  /** Set on LAB_REPORT rows only. */
  labOrderId: string | null;
  /**
   * `LAB/YYYYMMDD/####` for a LAB_REPORT row — the handle the bench and the
   * patient both quote, and the only thing about the order the admin surface
   * needs in order to chase a failure.
   */
  labOrderNumber: string | null;
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

/**
 * One recorded allergy that has not reached SATUSEHAT yet. Patient-scoped
 * rather than encounter-scoped: the value of an allergy is entirely
 * cross-facility, so each row is appended to whichever encounter bundle
 * happens to be next and then never sent again (P10-T08).
 */
export type SatusehatSubmissionAllergy = {
  allergyId: string;
  substance: string;
  reaction: string | null;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  recordedAt: Date;
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
  /** Null for a compound line; `prescriptionItemId` identifies it instead. */
  medication: SatusehatSubmissionMedication | null;
  prescriptionItemId: string | null;
  quantity: number;
  dispensedAt: Date;
};

/**
 * The inpatient stay this encounter belongs to, when it has one, loaded with
 * the encounter so the bundle can report `class: IMP` over the admission's own
 * period (P10-T09). Null for an ordinary outpatient visit, and for an
 * admission that was cancelled — a stay that never happened is not an
 * inpatient episode.
 */
export type SatusehatSubmissionAdmission = {
  admissionId: string;
  admittedAt: Date;
  dischargedAt: Date;
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
  admission: SatusehatSubmissionAdmission | null;
  diagnoses: readonly SatusehatSubmissionDiagnosis[];
  procedures: readonly SatusehatSubmissionProcedure[];
  immunizations: readonly SatusehatSubmissionImmunization[];
  unreportedAllergies: readonly SatusehatSubmissionAllergy[];
  /**
   * Allergies that were reported to SATUSEHAT and have since been retracted
   * locally. Retracting one on the platform needs an `entered-in-error` update
   * the adapter does not do yet (P10-T08), so the count is carried purely to
   * be logged — the divergence is visible rather than silent.
   */
  retractedReportedAllergyCount: number;
  latestVitalSigns: SatusehatSubmissionVitalSigns | null;
  prescriptions: readonly SatusehatSubmissionPrescription[];
  dispenseItems: readonly SatusehatSubmissionDispenseItem[];
};

/**
 * One ordered test, as the chain reports it: a `ServiceRequest` carrying the
 * test's LOINC, and — once the value is released — an `Observation` carrying
 * the measurement (P18-T09).
 *
 * `loincCode` is nullable because the catalog does not require one. An item
 * without it is skipped and gap-reported rather than sent uncoded, which is the
 * same rule the KFA mapping follows for medications.
 */
export type SatusehatLabReportItem = {
  labOrderItemId: string;
  /**
   * Position within the order, 1-based and stable: it is the `-{itemSeq}`
   * suffix of the ServiceRequest identifier, so it must not be derived from a
   * sort that a later edit could change.
   */
  itemSeq: number;
  testName: string;
  loincCode: string | null;
  loincDisplay: string | null;
  /** The tube this test was run from, null while the item is uncollected. */
  specimenId: string | null;
  /** The released value, or null when the item has none to report. */
  result: SatusehatLabReportResult | null;
};

export type SatusehatLabReportResult = {
  labResultId: string;
  /** Exactly one of the three is set, decided by the test's `LabResultType`. */
  valueNumeric: number | null;
  valueText: string | null;
  valueCoded: string | null;
  /** UCUM, snapshotted onto the result when it was entered. */
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: LabResultFlagValue | null;
  /** True when this row supersedes an earlier released one. */
  isAmendment: boolean;
  enteredAt: Date;
};

export type SatusehatLabReportSpecimen = {
  specimenId: string;
  specimenType: LabSpecimenTypeValue;
  accessionNumber: string;
  collectedAt: Date;
};

/**
 * Everything the lab chain is built from, read fresh at submission time the
 * way the encounter bundle is (P18-T09). The outbox stores no payload
 * snapshot, so a correction landed before the worker reaches the row is the
 * version that gets reported.
 */
export type SatusehatLabReportBundleData = {
  labOrderId: string;
  orderNumber: string;
  orderStatus: 'ORDERED' | 'COLLECTED' | 'IN_PROGRESS' | 'RESULTED' | 'RELEASED' | 'CANCELLED';
  orderedAt: Date;
  releasedAt: Date | null;
  /**
   * The encounter this order was placed in, and the IHS id its own outbox row
   * recorded. Null once P18-T10 allows an order without a visit; until then a
   * null here means the encounter row has not landed and the report waits.
   */
  encounterId: string | null;
  satusehatEncounterId: string | null;
  patientId: string;
  patientName: string;
  patientIhsNumber: string | null;
  /** Null for an order whose requester is not a doctor of this clinic. */
  doctorId: string | null;
  doctorName: string | null;
  practitionerIhsNumber: string | null;
  /**
   * The panel's LOINC when the whole order was one panel — the report would
   * then code as that panel rather than as a generic laboratory report.
   *
   * Null in every case today: the catalog gives tests a LOINC and panels none
   * (P18-T01). Carried anyway so the day panels gain one, only the read that
   * fills this in has to change.
   */
  singlePanelLoincCode: string | null;
  singlePanelLoincDisplay: string | null;
  /**
   * The encounter's primary diagnosis, carried onto every ServiceRequest as
   * `reasonCode`. Null when the encounter has none coded yet.
   */
  primaryConditionCode: string | null;
  primaryConditionDisplay: string | null;
  items: readonly SatusehatLabReportItem[];
  specimens: readonly SatusehatLabReportSpecimen[];
};

/**
 * The IHS ids the platform assigned each resource in the chain, written back
 * after a successful transaction so a resubmission updates rather than
 * duplicates (P18-T09).
 */
export type SaveLabReportIhsIdsPayload = {
  labOrderId: string;
  diagnosticReportId: string | null;
  serviceRequestIdsByItemId: Readonly<Record<string, string>>;
  specimenIdsBySpecimenId: Readonly<Record<string, string>>;
  observationIdsByResultId: Readonly<Record<string, string>>;
};

/**
 * One allergy row and the IHS id the platform assigned it, written back after
 * a successful transaction so the allergy is never reported twice (P10-T08).
 */
export type SaveAllergyIhsIdPayload = {
  allergyId: string;
  satusehatAllergyId: string;
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
  kind?: SatusehatSubmissionKindValue;
  encounterId?: string;
  labOrderId?: string;
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
