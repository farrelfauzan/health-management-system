/**
 * Adapter-only wire types for patient identifier encryption. These describe how
 * an identifier is persisted and must never leak into `@hms/shared-types` — the
 * domain type carries the plaintext identifier, the persistence row never does.
 */
export type PatientIdentifierCryptoConfig = {
  readonly encryptionKey: Buffer;
  readonly indexKey: Buffer;
  readonly keyVersion: number;
};

/**
 * The three columns a searchable identifier is stored across, plus the key
 * version that produced the ciphertext.
 */
export type EncryptedIdentifier = {
  readonly ciphertext: string;
  readonly index: string;
  readonly last4: string;
  readonly keyVersion: number;
};

/**
 * A sealed identifier that is never looked up by value (no blind index).
 */
export type SealedIdentifier = {
  readonly ciphertext: string;
  readonly keyVersion: number;
};
