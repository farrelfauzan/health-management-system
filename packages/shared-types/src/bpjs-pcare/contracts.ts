import type { BpjsPcareEnvironmentValue, BpjsReferenceCatalogValue } from '#bpjs-pcare/schemas';

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
