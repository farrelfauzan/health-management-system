/**
 * Adapter-only wire types for AI provider API-key encryption. Ciphertext
 * shapes must never leak into `@hms/shared-types` — the shared record carries
 * the four-character hint only, the persistence row never carries plaintext.
 */
export type AiProviderCryptoConfig = {
  readonly isConfigured: boolean;
  readonly encryptionKey: Buffer | null;
  readonly keyVersion: number;
};

/**
 * A sealed API key that is never looked up by value (no blind index — keys
 * are only ever decrypted to authenticate an outbound provider call).
 */
export type SealedApiKey = {
  readonly ciphertext: string;
  readonly keyVersion: number;
};
