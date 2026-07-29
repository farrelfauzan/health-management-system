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

export type BpjsSubmissionEncounterData = {
  id: string;
  status: string;
  endedAt: Date | null;
  subjective: string | null;
  doctor: BpjsSubmissionDoctorData | null;
  vitals: BpjsSubmissionVitalsData | null;
  diagnoses: BpjsSubmissionDiagnosisData[];
};

/**
 * Everything the per-type submission builders need, re-read live from the
 * clinical record at send time (no payload snapshot is stored in the
 * outbox). The decrypted BPJS number exists only inside this repository
 * projection and the outbound request built from it.
 */
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
  pendaftaran: {
    status: BpjsSubmissionStatusValue;
    bpjsReferenceNo: string | null;
    submittedKdPoli: string | null;
  } | null;
};
