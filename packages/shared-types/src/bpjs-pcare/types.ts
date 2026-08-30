import type {
  BpjsEligibilityIdentifierTypeValue,
  BpjsEligibilityOutcomeValue,
  BpjsPcareEnvironmentValue,
  BpjsReferenceCatalogValue,
  BpjsSubmissionStatusValue,
  BpjsSubmissionTypeValue,
} from '#bpjs-pcare/schemas';
import type { RegistrationStatusValue } from '#registration-flow/schemas';

/**
 * Repository projection of the stored PCare configuration. Deliberately
 * carries no ciphertext and no decrypted secret — those stay inside the API's
 * repository/crypto layer; the record exposes only the last-4 display values.
 */
export type BpjsPcareConfigRecord = {
  id: string;
  environment: BpjsPcareEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  pcareUsername: string;
  secretKeyLast4: string;
  userKeyLast4: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository write payload. Secrets are plaintext here because the repository
 * is the encryption boundary (it seals them before persisting); omitted
 * secrets keep the stored ciphertext on update and are rejected on create.
 */
export type SaveBpjsPcareConfigData = {
  environment: BpjsPcareEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  pcareUsername: string;
  secretKey?: string;
  userKey?: string;
  pcarePassword?: string;
  isActive: boolean;
};

/**
 * Create payload: the write-only secrets are mandatory on first save — there
 * is no stored value to fall back to yet.
 */
export type CreateBpjsPcareConfigData = SaveBpjsPcareConfigData & {
  secretKey: string;
  userKey: string;
  pcarePassword: string;
};

export type BpjsPcareConnectionTestOutcome = {
  isSuccessful: boolean;
  message: string;
  testedAt: Date;
};

export type BpjsReferenceItemRecord = {
  catalog: BpjsReferenceCatalogValue;
  code: string;
  display: string;
  groupCode: string | null;
  syncedAt: Date;
};

export type BpjsReferenceItemData = {
  code: string;
  display: string;
  groupCode?: string | null;
};

/**
 * Bulk-sync write: the catalog's rows are replaced wholesale in one
 * transaction so a partial upstream page can never leave a half-old,
 * half-new dropdown.
 */
export type ReplaceBpjsReferenceCatalogData = {
  catalog: BpjsReferenceCatalogValue;
  syncedAt: Date;
  items: BpjsReferenceItemData[];
};

/**
 * Keyword-cache write for the non-enumerable catalogs: results are upserted
 * incrementally, never replacing rows cached by earlier searches.
 */
export type UpsertBpjsReferenceItemsData = {
  catalog: BpjsReferenceCatalogValue;
  syncedAt: Date;
  items: BpjsReferenceItemData[];
};

export type BpjsReferenceCatalogStatusRecord = {
  catalog: BpjsReferenceCatalogValue;
  itemCount: number;
  lastSyncedAt: Date | null;
};

export type BpjsDoctorMappingRecord = {
  doctorId: string;
  fullName: string;
  specialtyName: string;
  bpjsDoctorCode: string | null;
};

export type BpjsSpecialtyMappingRecord = {
  specialtyId: string;
  name: string;
  bpjsPoliCode: string | null;
};

export type BpjsMedicationMappingRecord = {
  medicationId: string;
  code: string;
  name: string;
  dphoCode: string | null;
};

/**
 * Decrypted lookup identifiers for one patient, assembled inside the
 * repository (the crypto boundary) solely to build the outbound peserta
 * path. Never serialised into a response or log.
 */
export type BpjsPatientLookupIdentifiers = {
  patientId: string;
  bpjsNumber: string | null;
  nik: string | null;
};

export type BpjsEligibilityMemberData = {
  memberName: string | null;
  memberType: string | null;
  memberClass: string | null;
  providerCode: string | null;
  providerName: string | null;
  isRegisteredHere: boolean | null;
  isProlanis: boolean;
  isPrb: boolean;
  statusReason: string | null;
};

/** The settled outcome plus the member fields it carries — what a live lookup produces before the cache keys are attached. */
export type BpjsEligibilityOutcomeData = BpjsEligibilityMemberData & {
  outcome: BpjsEligibilityOutcomeValue;
};

export type BpjsEligibilityCheckRecord = BpjsEligibilityOutcomeData & {
  id: string;
  patientId: string;
  checkedDate: Date;
  checkedVia: BpjsEligibilityIdentifierTypeValue;
  checkedAt: Date;
};

export type SaveBpjsEligibilityCheckData = BpjsEligibilityOutcomeData & {
  patientId: string;
  checkedDate: Date;
  checkedVia: BpjsEligibilityIdentifierTypeValue;
  checkedAt: Date;
};

export type BpjsSubmissionRecord = {
  id: string;
  registrationId: string;
  type: BpjsSubmissionTypeValue;
  status: BpjsSubmissionStatusValue;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  submittedAt: Date | null;
  bpjsReferenceNo: string | null;
  submittedKdPoli: string | null;
  createdAt: Date;
};

export type MarkBpjsSubmissionSubmittedPayload = {
  id: string;
  bpjsReferenceNo: string | null;
  submittedKdPoli: string | null;
};

export type MarkBpjsSubmissionRetryPayload = {
  id: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string;
};

export type MarkBpjsSubmissionFailedPayload = {
  id: string;
  attempts: number;
  lastError: string;
};

export type ListBpjsSubmissionsParams = {
  status?: BpjsSubmissionStatusValue;
  type?: BpjsSubmissionTypeValue;
  registrationId?: string;
  skip: number;
  take: number;
};

export type BpjsSubmissionPage = {
  items: BpjsSubmissionRecord[];
  total: number;
};

export type BpjsMonthlyReconciliationCount = {
  type: BpjsSubmissionTypeValue;
  status: BpjsSubmissionStatusValue;
  count: number;
};

export type BpjsMonthlyReconciliationData = {
  counts: BpjsMonthlyReconciliationCount[];
  failures: BpjsSubmissionRecord[];
};

export type BpjsSubmissionDoctorData = {
  fullName: string;
  bpjsDoctorCode: string | null;
  bpjsPoliCode: string | null;
};

export type BpjsSubmissionVitalsData = {
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  heightCm: number | null;
  weightKg: number | null;
  pulseRate: number | null;
  respiratoryRate: number | null;
};

export type BpjsSubmissionDiagnosisData = {
  code: string;
  type: 'PRIMARY' | 'SECONDARY';
};

export type BpjsSubmissionReferralData = {
  destinationProviderCode: string;
  subSpecialtyCode: string | null;
  saranaCode: string | null;
  khususCode: string | null;
  estimatedReferralDate: Date;
  notes: string | null;
};

/**
 * One dispensed medication line aggregated for the obat submission.
 * `frequency` is the prescription's free-text dosing ("3x1") — the builder
 * parses it into PCare's signa pair, defaulting to 1×1 when unparseable.
 */
export type BpjsSubmissionDispensedMedicationData = {
  medicationName: string;
  dphoCode: string | null;
  quantity: number;
  frequency: string | null;
};

export type BpjsSubmissionEncounterData = {
  id: string;
  /**
   * When the doctor began seeing the patient. The closest thing HMS observes
   * to Antrean Online's "sedang dilayani" (P14-T05, §3.5) — there is no
   * "patient called" event to use instead.
   */
  startedAt: Date;
  status: string;
  endedAt: Date | null;
  subjective: string | null;
  doctor: BpjsSubmissionDoctorData | null;
  vitals: BpjsSubmissionVitalsData | null;
  diagnoses: BpjsSubmissionDiagnosisData[];
  referral: BpjsSubmissionReferralData | null;
};

/**
 * Everything the per-type submission builders need, re-read live from the
 * clinical record at send time (no payload snapshot is stored in the
 * outbox). The decrypted BPJS number exists only inside this repository
 * projection and the outbound request built from it.
 */
export type BpjsSubmissionSiblingRow = {
  status: BpjsSubmissionStatusValue;
  bpjsReferenceNo: string | null;
  submittedKdPoli: string | null;
};

/**
 * The fields only Antrean Online publishing needs (P14-T05), kept in their own
 * block rather than flattened onto the source data so the PCare submission
 * path reads exactly as it did before this task.
 *
 * `bpjsBookingCode` is the provenance marker and the reason this block exists
 * at all: a booking BPJS made through Mobile JKN is already BPJS's own row,
 * and publishing `antrean/add` for it would give the member two queue numbers.
 */
export type BpjsAntreanSubmissionSourceData = {
  /** BPJS's own identifier when the booking came from Mobile JKN; null for a walk-in. */
  bpjsBookingCode: string | null;
  /** The per-poli antrian number (P14-T01) — what `angkaantrean` carries. */
  poliQueueNumber: number | null;
  poliCode: string | null;
  poliName: string | null;
  doctorCode: string | null;
  doctorName: string | null;
  /** Session window as `HH:mm-HH:mm`, or null for a walk-in with no session. */
  practiceWindow: string | null;
  sessionStart: Date | null;
  medicalRecordNumber: string;
  nationalIdentityNumber: string | null;
  phoneNumber: string;
};

export type BpjsSubmissionSourceData = {
  registration: {
    id: string;
    status: RegistrationStatusValue;
    queueDate: Date | null;
    checkedInAt: Date | null;
  };
  patient: {
    bpjsNumber: string | null;
  };
  appointmentDoctor: BpjsSubmissionDoctorData | null;
  encounter: BpjsSubmissionEncounterData | null;
  dispensedMedications: BpjsSubmissionDispensedMedicationData[];
  pendaftaran: BpjsSubmissionSiblingRow | null;
  kunjungan: BpjsSubmissionSiblingRow | null;
  antrean: BpjsAntreanSubmissionSourceData;
  /** The sibling `ANTREAN_ADD` row, read by `panggil` and `batal` to know a queue entry exists upstream. */
  antreanAdd: BpjsSubmissionSiblingRow | null;
};

/**
 * Arguments for one BPJS outbox claim. `leaseMs` is how long the claimed rows
 * stay invisible to other workers, which is what keeps a horizontally scaled
 * deployment from reporting the same visit to BPJS twice.
 */
export type ClaimDueBpjsSubmissionsPayload = {
  limit: number;
  leaseMs: number;
};
