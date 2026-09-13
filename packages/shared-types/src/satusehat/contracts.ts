import type {
  SatusehatEnvironmentValue,
  SatusehatRecordLineCategoryValue,
  SatusehatRecordLineOutcomeValue,
  SatusehatResourceSkipReasonValue,
  SatusehatSubmissionKindValue,
  SatusehatSubmissionStatusValue,
} from '#satusehat/schemas';

/**
 * API response contracts for SATUSEHAT master-data linkage.
 *
 * A patient's IHS number is stored encrypted and treated like the other
 * national identifiers, so its link result only confirms presence — the value
 * is revealed exclusively through the audited patient-identifiers unmask
 * route. A practitioner IHS number is a pseudonymous Kemenkes-issued id
 * stored in plaintext, so its link result carries the value.
 */
export type SatusehatPatientLinkResult = {
  patientId: string;
  hasSatusehatPatientId: boolean;
  alreadyLinked: boolean;
};

export type SatusehatDoctorLinkResult = {
  doctorId: string;
  satusehatPractitionerId: string;
  alreadyLinked: boolean;
};

/**
 * Admin-facing view of one outbox row (P10-T06). Scheduling state only — the
 * outbox stores no payload snapshot, so the view exposes no clinical data and
 * no patient identifiers beyond the local encounter or order UUID.
 *
 * A LAB_REPORT row (P18-T09) carries `labOrderId` and the order number the
 * bench and the patient both quote, and no encounter. Exactly one of the two
 * ids is set, which is what `kind` says.
 */
export type SatusehatSubmissionView = {
  id: string;
  kind: SatusehatSubmissionKindValue;
  encounterId: string | null;
  labOrderId: string | null;
  /**
   * `LAB/YYYYMMDD/####` for a LAB_REPORT row — the local handle an admin
   * chasing a failure works from. Never a value or a patient identifier.
   */
  labOrderNumber: string | null;
  status: SatusehatSubmissionStatusValue;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  submittedAt: string | null;
  satusehatEncounterId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SatusehatSubmissionsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type SatusehatSubmissionsListResult = {
  items: SatusehatSubmissionView[];
  meta: SatusehatSubmissionsListMeta;
};

/**
 * One line of the treating doctor's comparison between the local record and
 * what SATUSEHAT holds for the visit (P21-T04).
 *
 * Unlike the integrations monitor (P21-T03), this carries clinical content —
 * codes, displays, values — because it is gated by `satusehat.record.read:own`
 * and served only to the clinician who examined the patient (D-033). A
 * `NOT_SENT` line names the item and its reason, since the fix is usually a
 * catalog code only the clinic can add.
 */
export type SatusehatRecordLine = {
  category: SatusehatRecordLineCategoryValue;
  /** ICD-10 for diagnoses, LOINC for vital signs, ICD-9-CM for procedures, KFA for medications. */
  code: string | null;
  display: string;
  /** The local value as text, or null when only SATUSEHAT holds the item. */
  ours: string | null;
  /** What SATUSEHAT holds as text, or null when it holds nothing for the item. */
  satusehat: string | null;
  outcome: SatusehatRecordLineOutcomeValue;
  /** Set only on `NOT_SENT` lines. */
  notSentReason: SatusehatResourceSkipReasonValue | null;
};

export type SatusehatRecordComparisonView = {
  encounterId: string;
  /** Null when the visit was never queued for SATUSEHAT. */
  submissionId: string | null;
  isSubmitted: boolean;
  checkedAt: string;
  lines: SatusehatRecordLine[];
  /**
   * Reads that failed for a reason other than "not found". While this is above
   * zero a `MISSING_ON_SATUSEHAT` line may only mean the platform could not be
   * asked, so the screen says so rather than presenting it as a finding.
   */
  unreadableResourceCount: number;
};

/**
 * What the integrations screen needs to say which SATUSEHAT platform is live
 * (P21-T06).
 *
 * Derived from the configured base URL rather than a separate flag, so it cannot
 * disagree with where the bundles actually go — a flag someone forgot to flip
 * during the production switch is exactly the failure this is meant to catch.
 *
 * `isConfigured` is already visible through every SATUSEHAT route's behaviour;
 * it is repeated here so one request answers "is this on, and is it real".
 * Nothing identifying is exposed: no credentials, and no organization id.
 */
export type SatusehatEnvironmentStatus = {
  environment: SatusehatEnvironmentValue;
  isConfigured: boolean;
  /** Host only, never the full URL with its path — enough to recognise a proxy. */
  fhirHost: string;
};
