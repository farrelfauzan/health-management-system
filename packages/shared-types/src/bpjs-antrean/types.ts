import type { BpjsAntreanEnvironmentValue } from '#bpjs-antrean/schemas';

/**
 * Repository projection of the stored Antrean configuration. Deliberately
 * carries no ciphertext, no decrypted secret, and no password hash — those
 * stay inside the API's repository/crypto layer; the record exposes only the
 * last-4 display values and a presence flag for the inbound password.
 */
export type BpjsAntreanConfigRecord = {
  id: string;
  environment: BpjsAntreanEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  secretKeyLast4: string;
  userKeyLast4: string;
  inboundUsername: string | null;
  hasInboundPassword: boolean;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository write payload. Secrets are plaintext here because the repository
 * is the encryption boundary — it seals the outbound keys and hashes the
 * inbound password before persisting. Omitted values keep what is stored on
 * update; the outbound keys are rejected as missing on create.
 */
export type SaveBpjsAntreanConfigData = {
  environment: BpjsAntreanEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  secretKey?: string;
  userKey?: string;
  inboundUsername?: string;
  inboundPassword?: string;
  isActive: boolean;
};

/**
 * Create payload: the two outbound secrets are mandatory on first save —
 * there is no stored value to fall back to yet. The inbound pair stays
 * optional because BPJS agrees it at UAT (P14-T04), not at credential intake.
 */
export type CreateBpjsAntreanConfigData = SaveBpjsAntreanConfigData & {
  secretKey: string;
  userKey: string;
};

export type BpjsAntreanConnectionTestOutcome = {
  isSuccessful: boolean;
  message: string;
  testedAt: Date;
};
