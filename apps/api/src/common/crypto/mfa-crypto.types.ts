/**
 * Adapter-only wire types for TOTP secret encryption (SJ-8). Ciphertext shapes
 * must never leak into `@hms/shared-types` — a shared MFA record carries
 * whether a second factor is enrolled, never the material behind it.
 */
export type MfaCryptoConfig = {
  readonly isConfigured: boolean;
  readonly encryptionKey: Buffer | null;
  readonly keyVersion: number;
};

/**
 * A sealed TOTP secret. Unlike a password hash this is reversible on purpose:
 * TOTP is symmetric, so the server has to recompute the same HMAC the
 * authenticator app does. What the encryption buys is that a database
 * disclosure on its own yields no working second factor — the attacker needs
 * the application key too.
 */
export type SealedTotpSecret = {
  readonly ciphertext: string;
  readonly keyVersion: number;
};
