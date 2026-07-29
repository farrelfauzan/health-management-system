import type {
  BpjsEligibilityIdentifierTypeValue,
  BpjsEligibilityResultState,
  BpjsPcareEnvironmentValue,
  BpjsReferenceCatalogValue,
  BpjsSubmissionStatusValue,
  BpjsSubmissionTypeValue,
} from '#bpjs-pcare/schemas';

/**
 * Admin-facing view of the facility's PCare bridging configuration. Secrets
 * are write-only: the view carries presence flags and last-4 display values,
 * never the secret itself — the stored values cannot be read back through the
 * API at all.
 */
export type BpjsPcareConfigView = {
  id: string;
  environment: BpjsPcareEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  pcareUsername: string;
  hasSecretKey: boolean;
  secretKeyLast4: string;
  hasUserKey: boolean;
  userKeyLast4: string;
  hasPcarePassword: boolean;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Outcome of a test-connection call. A failed test is a successful HTTP
 * response — the endpoint reports the upstream outcome instead of erroring,
 * so the settings screen can render "gagal" states with the readable reason.
 */
export type BpjsPcareConnectionTestResult = {
  isSuccessful: boolean;
  message: string;
  testedAt: string;
};

export type BpjsReferenceItemView = {
  catalog: BpjsReferenceCatalogValue;
  code: string;
  display: string;
  groupCode?: string;
  syncedAt: string;
};

/**
 * Per-catalog sync state for the settings screen: item count, when it was
 * last synced, and whether the bulk sync button covers it (`isSyncable` is
 * false for the keyword-cached DIAGNOSA/DPHO catalogs).
 */
export type BpjsReferenceCatalogStatusView = {
  catalog: BpjsReferenceCatalogValue;
  itemCount: number;
  lastSyncedAt: string | null;
  isSyncable: boolean;
};

export type BpjsReferenceSyncCatalogResultView = {
  catalog: BpjsReferenceCatalogValue;
  itemCount: number;
};

export type BpjsReferenceSyncResultView = {
  syncedAt: string;
  catalogs: BpjsReferenceSyncCatalogResultView[];
};

export type BpjsDoctorMappingView = {
  doctorId: string;
  fullName: string;
  specialtyName: string;
  bpjsDoctorCode: string | null;
};

export type BpjsSpecialtyMappingView = {
  specialtyId: string;
  name: string;
  bpjsPoliCode: string | null;
};

export type BpjsMedicationMappingView = {
  medicationId: string;
  code: string;
  name: string;
  dphoCode: string | null;
};

/**
 * One payload for the admin mapping screen: every doctor and specialty with
 * its current BPJS code. Medications are absent deliberately — the catalog is
 * large and pageable, so DPHO linking rides the existing medication list.
 */
export type BpjsMappingOverviewView = {
  doctors: BpjsDoctorMappingView[];
  specialties: BpjsSpecialtyMappingView[];
};

/**
 * What the eligibility card renders for a resolved member: BPJS's registered
 * name, member type and class, the member's registered FKTP (with a computed
 * flag for whether that is this clinic), Prolanis/PRB program flags, and
 * BPJS's readable reason when the member is inactive. Carries no card
 * number — the BPJS number never leaves the patient profile.
 */
export type BpjsEligibilityMemberView = {
  name: string | null;
  memberType: string | null;
  memberClass: string | null;
  providerCode: string | null;
  providerName: string | null;
  isRegisteredHere: boolean | null;
  isProlanis: boolean;
  isPrb: boolean;
  statusReason: string | null;
};

/**
 * Outcome of an eligibility check. UNREACHABLE is a 200 response, not an
 * error: registration must proceed while the card shows "BPJS tidak dapat
 * dihubungi" — and it is never cached, so the next check retries upstream.
 */
export type BpjsEligibilityResultView = {
  state: BpjsEligibilityResultState;
  isFromCache: boolean;
  checkedAt: string;
  checkedVia?: BpjsEligibilityIdentifierTypeValue;
  member?: BpjsEligibilityMemberView;
  message: string;
};

/**
 * Ops view of one outbox row. Scheduling state plus PCare's returned
 * reference number only — no payload snapshot exists, so nothing clinical
 * can leak through the monitor.
 */
export type BpjsSubmissionView = {
  id: string;
  registrationId: string;
  type: BpjsSubmissionTypeValue;
  status: BpjsSubmissionStatusValue;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  submittedAt: string | null;
  bpjsReferenceNo: string | null;
  createdAt: string;
};

export type BpjsSubmissionsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type BpjsSubmissionsListResult = {
  items: BpjsSubmissionView[];
  meta: BpjsSubmissionsListMeta;
};

export type BpjsMonthlyReportTypeSummaryView = {
  type: BpjsSubmissionTypeValue;
  /** Everything enqueued for visits in the month — tercatat. */
  recorded: number;
  /** Accepted by PCare — terkirim. */
  submitted: number;
  /** Still queued or backing off. */
  pending: number;
  /** Terminal failures needing an admin — gagal. */
  failed: number;
};

export type BpjsMonthlyReportFailureView = {
  submissionId: string;
  registrationId: string;
  type: BpjsSubmissionTypeValue;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
};

/**
 * The monthly tercatat / terkirim / gagal reconciliation (P11-T06): counts
 * per submission type for visits in the month, plus the failed rows to chase
 * before the BPJS claim deadline closes.
 */
export type BpjsMonthlyReportView = {
  month: string;
  types: BpjsMonthlyReportTypeSummaryView[];
  failures: BpjsMonthlyReportFailureView[];
};
