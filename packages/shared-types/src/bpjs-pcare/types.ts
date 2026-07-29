import type { BpjsPcareEnvironmentValue } from '#bpjs-pcare/schemas';

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
