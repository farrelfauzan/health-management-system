import type { DischargeDispositionValue } from '#admission-flow/schemas';
import type { ImmunizationReasonValue } from '#emr/schemas';
import type { LabResultFlagValue, LabSpecimenTypeValue } from '#laboratory/schemas';
import type { SatusehatLocationRegistrationOutcomeView } from '#satusehat/contracts';
import type {
  SatusehatLocationBlockReasonValue,
  SatusehatLocationFallbackReasonValue,
  SatusehatLocationKindValue,
  SatusehatResourceOutcomeValue,
  SatusehatResourceSkipReasonValue,
  SatusehatServiceClassValue,
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
  /** Shown beside the SATUSEHAT name when an IHS number is typed by hand (P21-T08). */
  fullName: string;
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
  /**
   * Set when the reported Encounter named a fallback Location instead of the
   * visit's own poli (P24-T07). Null on a row that named the poli, on a row
   * that never named one (a lab report has no poli), and on every row settled
   * before the column existed. Presence only — the monitor shows a warning,
   * never clinical content.
   */
  locationFallbackReason: SatusehatLocationFallbackReasonValue | null;
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
/**
 * One vaccination row as the bundle builder reads it (P10-T16, P24-T12).
 *
 * `recordedAt` is the row's `createdAt` — when the clinic wrote it down,
 * which is what `Immunization.recorded` means, as opposed to `occurredAt`,
 * when the dose went in. The performer fields describe the clinician named on
 * the row, who may not be the attending doctor: a midwife's dose is reported
 * under the midwife, and `performerIhsNumber` is null when that clinician
 * has no SATUSEHAT practitioner id yet.
 */
export type SatusehatSubmissionImmunization = {
  immunizationId: string;
  kfaCode: string | null;
  vaccineName: string;
  occurredAt: Date;
  recordedAt: Date;
  lotNumber: string | null;
  expirationDate: string | null;
  doseNumber: number | null;
  route: 'IM' | 'SC' | 'ID' | 'ORAL' | 'NASAL' | null;
  site: 'LEFT_ARM' | 'RIGHT_ARM' | 'LEFT_THIGH' | 'RIGHT_THIGH' | 'OTHER' | null;
  notes: string | null;
  isHistorical: boolean;
  reason: ImmunizationReasonValue | null;
  performerId: string | null;
  performerName: string | null;
  performerIhsNumber: string | null;
};

/** The clinician an Immunization entry names as its performer (P24-T12). */
export type SatusehatImmunizationPerformer = {
  ihsNumber: string;
  name: string;
};

/**
 * A vaccination row with everything the platform demands present: a KFA
 * code, a dose number for `protocolApplied`, a reason for `reasonCode`, and a
 * performer with a practitioner id. Narrowed once, so the mapper input needs
 * no defaults.
 */
export type SatusehatReportableImmunization = SatusehatSubmissionImmunization & {
  kfaCode: string;
  doseNumber: number;
  reason: ImmunizationReasonValue;
  performer: SatusehatImmunizationPerformer;
};

/**
 * What the bundle builder does with one vaccination row: send it, or leave it
 * out under a named reason the resource list records (P21-T02, P24-T12).
 */
export type SatusehatImmunizationEntryResolution =
  | { skipReason: SatusehatResourceSkipReasonValue; immunization: null }
  | { skipReason: null; immunization: SatusehatReportableImmunization };

export type ResolveSatusehatImmunizationEntryInput = {
  immunization: SatusehatSubmissionImmunization;
  encounterDoctorId: string;
  encounterDoctorName: string;
  /** Already resolved — and auto-linked if need be — for the Encounter itself. */
  encounterPractitionerIhsNumber: string;
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
  /** How the stay ended; null on a row discharged before P24-T08. */
  dischargeDisposition: DischargeDispositionValue | null;
  /** The beds occupied, oldest first (FR-IP-01). */
  beds: readonly SatusehatSubmissionBedStay[];
};

/**
 * One bed of an inpatient stay, as the bundle reports it: the bed's registered
 * Location, the class its room is in, and the period it was occupied.
 */
export type SatusehatSubmissionBedStay = {
  bedId: string;
  satusehatLocationId: string | null;
  serviceClass: SatusehatServiceClassValue | null;
  startedAt: Date;
  endedAt: Date | null;
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
  /**
   * The poli the visit was registered under and the clinic's registered root,
   * read together so the Location the bundle names is decided from one
   * snapshot rather than from a second query taken later (P24-T07).
   */
  encounterLocation: Omit<
    SatusehatEncounterLocationSources,
    'configuredLocationId' | 'bedLocationIds'
  >;
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
  /**
   * The visit, which every order has. When there is no encounter (P18-T10) the
   * chain sends a minimal Encounter for this registration inside its own
   * bundle, identified by this id so a resubmission updates it rather than
   * creating a second visit for one blood draw.
   */
  registrationId: string;
  visitStartedAt: Date;
  /**
   * The clinic's registered root site Location, so a lab-only visit reports
   * under it rather than under `SATUSEHAT_LOCATION_ID` alone (P24-T07). A
   * blood draw belongs to no poli, so it never carries a fallback warning.
   */
  registeredRootLocationId: string | null;
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

/**
 * One immunization row and the IHS id the platform assigned it (P21-T02). The
 * column shipped with the schema and nothing ever wrote it, so every reported
 * vaccination read as unreported.
 */
export type SaveImmunizationIhsIdPayload = {
  immunizationId: string;
  satusehatImmunizationId: string;
};

/**
 * What settling a row as SUBMITTED records. `locationFallbackReason` is
 * written here rather than when the bundle is built, so it describes the
 * Location that actually reached the platform (P24-T07).
 */
export type MarkSubmissionSubmittedPayload = {
  id: string;
  satusehatEncounterId: string | null;
  locationFallbackReason: SatusehatLocationFallbackReasonValue | null;
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
 * A resource read back from SATUSEHAT, reduced to the fields the doctor's
 * comparison reads (P21-T04). Every field is `unknown` because it comes off the
 * wire: the comparison narrows each one rather than trusting the platform's
 * shape, which P21-T01 showed differs from the docs.
 */
export type SatusehatHeldResource = {
  readonly resourceType?: unknown;
  readonly code?: unknown;
  readonly valueQuantity?: unknown;
  readonly valueString?: unknown;
  readonly valueCodeableConcept?: unknown;
};

/**
 * One code SATUSEHAT holds, as the comparison reads it off a returned resource
 * (P21-T04). `value`/`unit` come from `valueQuantity`; `valueText` from
 * `valueString` or `valueCodeableConcept`, which is how a non-numeric lab
 * result is sent.
 */
export type SatusehatHeldCode = {
  display: string;
  value: number | null;
  unit: string | null;
  valueText: string | null;
};

/**
 * What a read-back of one submission found (P21-T04): the resources SATUSEHAT
 * returned, and how many sent resources could not be read — a failed read, or
 * a resource whose id was never paired. Those are reported rather than dropped,
 * so an unanswered question never renders as "missing on SATUSEHAT".
 */
export type SatusehatHeldReadBack = {
  held: SatusehatHeldResource[];
  unreadableResourceCount: number;
};

/** Everything the doctor's comparison needs, with no I/O left to do (P21-T04). */
export type SatusehatRecordComparisonInput = {
  diagnoses: readonly SatusehatSubmissionDiagnosis[];
  latestVitalSigns: SatusehatSubmissionVitalSigns | null;
  procedures: readonly SatusehatSubmissionProcedure[];
  medications: readonly SatusehatSubmissionMedication[];
  /** Every item of every non-cancelled lab order raised in the visit. */
  labItems: readonly SatusehatLabReportItem[];
  held: readonly SatusehatHeldResource[];
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
 * One patient test identity for the SATUSEHAT staging sandbox (P21-T10). Like
 * {@link SatusehatSandboxPractitioner} there is deliberately no IHS number:
 * it is resolved from the NIK at link time, because published values have not
 * survived contact with the live index. `name` and `sex` are local placeholders
 * only — the bundle references the patient by IHS number, so neither is
 * compared against what the platform holds.
 */
export type SatusehatSandboxPatient = {
  readonly nik: string;
  readonly name: string;
  readonly sex: 'MALE' | 'FEMALE';
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

/**
 * One line of "what this submission sent, and what it left out" (P21-T02).
 *
 * Deliberately carries **no clinical values** — no codes, names, displays or
 * results. `localRecordId` is the only link back to what the item was, and
 * resolving it needs a doctor's permission (P21-T04). That is what allows the
 * ADMIN-gated integrations monitor to render these rows directly without
 * breaking the P10-T06 promise that the outbox holds no clinical payload.
 *
 * `satusehatId` is null on every SKIPPED row and also on a SENT row the
 * transaction response could not be paired against — the resource went, but
 * which one it became is unknown, so it can never be read back.
 */
export type SatusehatSubmissionResourcePayload = {
  resourceType: string;
  outcome: SatusehatResourceOutcomeValue;
  skipReason: SatusehatResourceSkipReasonValue | null;
  satusehatId: string | null;
  localRecordId: string | null;
  isBackfilled: boolean;
};

/**
 * One recorded line of what a submission sent or skipped, as read back for the
 * monitor (P21-T03). Same shape the writer persists, plus nothing: the table
 * holds no clinical values, so neither does this.
 */
export type SatusehatSubmissionResourceRecord = {
  resourceType: string;
  outcome: SatusehatResourceOutcomeValue;
  skipReason: SatusehatResourceSkipReasonValue | null;
  satusehatId: string | null;
  localRecordId: string | null;
  isBackfilled: boolean;
};

/**
 * Replaces a submission's resource list wholesale. A retry that succeeds
 * describes the bundle that actually landed, so the previous attempt's list is
 * deleted rather than added to — two attempts' rows side by side would double
 * every count the monitor shows.
 */
export type SaveSubmissionResourcesPayload = {
  submissionId: string;
  resources: readonly SatusehatSubmissionResourcePayload[];
};

/**
 * What `GET /Practitioner/:id` identifies a practitioner by, and nothing more
 * (P21-T08). Probed live: the resource carries only `id`, `identifier`, `name`
 * and `meta`. There is no gender and no birth date, and the NIK comes back
 * masked to its last three digits (`*************ddd`).
 */
export type SatusehatPractitionerSummary = {
  ihsNumber: string;
  name: string | null;
  maskedNik: string | null;
};

/**
 * What decides whether a row may be registered as a SATUSEHAT Location
 * (P24-T05). `roomClass` is present for rooms and beds only: a site, poli or
 * ward carries no service class.
 */
export type SatusehatLocationRegistrationCheckInput = {
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  roomClass: { name: string; satusehatServiceClass: SatusehatServiceClassValue | null } | null;
};

/** Why a row cannot be registered yet, and the message that names what to fix. */
export type SatusehatLocationRegistrationBlocker = {
  reason: SatusehatLocationBlockReasonValue;
  message: string;
};

/** Where the root site Location id comes from (FR-LOC-02). */
export type SatusehatRootLocationSources = {
  registeredRootLocationId: string | null;
  configuredLocationId: string | undefined;
};

/**
 * Where the Location id on one reported Encounter comes from (FR-LOC-09).
 * `specialtyLocationId` is the poli's own registered Location; the rest is the
 * root chain the visit falls back to when it has none.
 */
export type SatusehatEncounterLocationSources = SatusehatRootLocationSources & {
  /** Null when the visit names no poli, or when its poli is unregistered. */
  specialtyLocationId: string | null;
  /** Null only when the visit names no poli at all. */
  specialtyName: string | null;
  /**
   * The Location of each bed an inpatient stay passed through, in order, with
   * a null for any bed nobody has registered (P24-T08). Empty for an
   * outpatient visit, which is what makes the poli decide instead.
   */
  bedLocationIds: readonly (string | null)[];
};

/**
 * What decides the discharge code an inpatient stay reports (P24-T08). The
 * disposition is null for a stay discharged before the column existed, which
 * keeps D-030's `home`.
 */
export type SatusehatDischargeDispositionInput = {
  disposition: DischargeDispositionValue | null;
  admittedAt: Date;
  dischargedAt: Date;
};

/** One `hospitalization.dischargeDisposition` coding, ready to send. */
export type SatusehatDischargeDisposition = {
  system: string;
  code: string;
  display: string;
};

/**
 * The Location one Encounter reports under, and why it is not the poli's own
 * when it is not. `locationId` is null only when nothing is configured at all,
 * which the mapper still refuses.
 */
export type SatusehatEncounterLocation = {
  locationId: string | null;
  fallbackReason: SatusehatLocationFallbackReasonValue | null;
};

/**
 * Everything the Location tree is built from, as the repository reads it
 * (P24-T06). Inactive and soft-deleted rows are present only when they were
 * registered, so a deactivation can still be pushed as `status: inactive`
 * (FR-LOC-08); an unregistered inactive row has nothing to tell SATUSEHAT.
 */
export type SatusehatLocationSourceRecords = {
  clinic: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    satusehatLocationId: string | null;
  } | null;
  specialties: {
    id: string;
    name: string;
    isActive: boolean;
    isDeleted: boolean;
    satusehatLocationId: string | null;
  }[];
  wards: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    isDeleted: boolean;
    satusehatLocationId: string | null;
  }[];
  rooms: {
    id: string;
    wardId: string;
    code: string;
    name: string;
    isActive: boolean;
    isDeleted: boolean;
    satusehatLocationId: string | null;
    roomClass: { name: string; satusehatServiceClass: SatusehatServiceClassValue | null };
  }[];
  beds: {
    id: string;
    roomId: string;
    code: string;
    isDeleted: boolean;
    satusehatLocationId: string | null;
  }[];
};

/**
 * One tree row plus what a Location resource for it needs: the clinic's
 * position and, for rooms and beds, the room class (P24-T06).
 */
export type SatusehatLocationTreeEntry = {
  kind: SatusehatLocationKindValue;
  id: string;
  parentId: string | null;
  depth: number;
  name: string;
  code: string | null;
  isActive: boolean;
  satusehatLocationId: string | null;
  /** The room class, for rooms and beds only; its name is what a blocker message names. */
  roomClass: { name: string; satusehatServiceClass: SatusehatServiceClassValue | null } | null;
};

/**
 * What deciding one row's blocker needs besides the row: the clinic's position
 * and the parent as it stands at that moment, because a parent registered
 * earlier in the same batch unblocks its children (P24-T06).
 */
export type SatusehatLocationBlockerCheck = {
  entry: SatusehatLocationTreeEntry;
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  parent: { name: string; satusehatLocationId: string | null } | null;
};

/** Stores the Location id SATUSEHAT holds for one row (P24-T06). */
export type SaveSatusehatLocationIdPayload = {
  kind: SatusehatLocationKindValue;
  id: string;
  satusehatLocationId: string;
};

/**
 * The state one registration request walks the tree with (P24-T06).
 * `locationIds` starts as the stored ids and gains each id the batch registers,
 * so a parent registered a moment ago unblocks its children in the same batch.
 */
export type SatusehatLocationRegistrationContext = {
  organizationId: string;
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  registeredClinicLocationId: string | null;
  locationIds: Map<string, string | null>;
  entriesById: Map<string, SatusehatLocationTreeEntry>;
  actorUserId: string;
};

/** One row as it is pushed: its current id and its parent as the batch stands. */
export type SatusehatLocationPushInput = {
  entry: SatusehatLocationTreeEntry;
  context: SatusehatLocationRegistrationContext;
  currentId: string | null;
  parent: { name: string; satusehatLocationId: string | null } | null;
};

/** What registering one row produced, and whether the rest of the batch must stop. */
export type SatusehatLocationEntryRegistration = {
  view: SatusehatLocationRegistrationOutcomeView;
  shouldStopBatch: boolean;
};
