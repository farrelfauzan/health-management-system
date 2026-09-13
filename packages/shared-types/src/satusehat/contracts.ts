import type {
  SatusehatEnvironmentValue,
  SatusehatNikSuffixCheckValue,
  SatusehatResourceCheckOutcomeValue,
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
 * What SATUSEHAT holds under a hand-typed practitioner IHS number (P21-T08),
 * shown before anything is saved. The platform returns no gender and no birth
 * date, so the check is the name beside ours plus `nikSuffixCheck`. The masked
 * NIK itself is never returned.
 */
export type SatusehatDoctorIhsPreview = {
  doctorId: string;
  ihsNumber: string;
  doctorName: string;
  satusehatName: string | null;
  nikSuffixCheck: SatusehatNikSuffixCheckValue;
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

/**
 * One resource type as one submission sent it (P21-T03), grouped for the
 * integrations monitor.
 *
 * Counts and ids only. No codes, names, displays or values reach this shape,
 * because the monitor is gated by `satusehat.submission.read` (ADMIN) and was
 * built as scheduling state (P10-T06) — and under P22 only clinicians may see a
 * patient's record. So it answers "did the visit's Conditions arrive", never
 * "what were they".
 */
export type SatusehatSubmissionResourceGroup = {
  resourceType: string;
  sentCount: number;
  /** The ids SATUSEHAT assigned, for the read-back check. Never local ids. */
  satusehatIds: string[];
  /**
   * How many sent resources could not be paired to an id in the transaction
   * response. They reached the platform, but which resource they became is
   * unknown, so they can never be read back.
   */
  unpairedCount: number;
  /** Skipped items by reason category — a count, never the item. */
  skipped: SatusehatSubmissionSkipGroup[];
};

export type SatusehatSubmissionSkipGroup = {
  reason: SatusehatResourceSkipReasonValue;
  count: number;
};

/**
 * A submission plus what it actually sent (P21-T03).
 *
 * `hasResourceList` distinguishes "this submission sent nothing" from
 * "this submission predates the list" (P21-T02). Without it a row submitted
 * before that shipped would render as an empty success, which is the same
 * mistake the lab-report-that-sent-nothing case makes.
 */
export type SatusehatSubmissionDetailView = {
  submission: SatusehatSubmissionView;
  hasResourceList: boolean;
  /** True when the list was reconstructed by the P21-T05 backfill, which cannot know what was skipped. */
  isBackfilled: boolean;
  resources: SatusehatSubmissionResourceGroup[];
};

/**
 * What SATUSEHAT holds for one resource we sent (P21-T03).
 *
 * This is the whitelist, and it is a whitelist rather than a denylist on
 * purpose: P21-T01 found that **every** resource the platform returns carries
 * the patient's name in `subject.display`, and practitioner names in
 * `participant`, `performer`, `requester`, `assessor` and `author`. Excluding
 * "clinical-looking" fields would have passed the patient's name straight to
 * the front desk. So the projection names what it keeps and drops the rest.
 *
 * `status` is null for a `Condition`, which carries `clinicalStatus` instead
 * (also P21-T01) — a comparison keyed on `status` would report every diagnosis
 * as an unknown state.
 */
export type SatusehatResourceCheckResult = {
  resourceType: string;
  satusehatId: string;
  outcome: SatusehatResourceCheckOutcomeValue;
  /** Opaque platform version string, not a number — compare as text. */
  versionId: string | null;
  lastUpdated: string | null;
  status: string | null;
  /** Set only when `outcome` is ERROR: the upstream failure code, never a payload. */
  errorCode: string | null;
};

export type SatusehatSubmissionCheckView = {
  submissionId: string;
  checkedAt: string;
  results: SatusehatResourceCheckResult[];
};
