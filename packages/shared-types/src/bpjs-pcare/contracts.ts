import type { BpjsPcareEnvironmentValue } from '#bpjs-pcare/schemas';

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
