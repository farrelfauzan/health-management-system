import type { BpjsAntreanEnvironmentValue } from '#bpjs-antrean/schemas';

/**
 * Admin-facing view of the facility's Antrean Online bridging configuration.
 * Secrets are write-only: the view carries presence flags and last-4 display
 * values, never the secret itself — the stored values cannot be read back
 * through the API at all. The inbound username is not a secret and is shown
 * in full, because the admin has to check it against what BPJS agreed at UAT.
 */
export type BpjsAntreanConfigView = {
  id: string;
  environment: BpjsAntreanEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  hasSecretKey: boolean;
  secretKeyLast4: string;
  hasUserKey: boolean;
  userKeyLast4: string;
  inboundUsername: string | null;
  hasInboundPassword: boolean;
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
export type BpjsAntreanConnectionTestResult = {
  isSuccessful: boolean;
  message: string;
  testedAt: string;
};
