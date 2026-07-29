/**
 * Adapter-only wire types for BPJS PCare credential encryption. Ciphertext
 * shapes must never leak into `@hms/shared-types` — the shared record carries
 * last-4 display values only, the persistence row never carries plaintext.
 */
export type BpjsCredentialCryptoConfig = {
  readonly isConfigured: boolean;
  readonly encryptionKey: Buffer | null;
  readonly keyVersion: number;
};

/**
 * A sealed credential that is never looked up by value (no blind index —
 * credentials are only ever decrypted for outbound PCare calls).
 */
export type SealedCredential = {
  readonly ciphertext: string;
  readonly keyVersion: number;
};
