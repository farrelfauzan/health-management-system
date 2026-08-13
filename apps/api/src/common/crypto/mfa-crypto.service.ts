import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveMfaCryptoConfig } from './mfa-crypto.config';
import { MfaCryptoConfig, SealedTotpSecret } from './mfa-crypto.types';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const INITIALISATION_VECTOR_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Encrypts TOTP secrets at rest (SJ-8), using the sealed-value layout the rest
 * of the codebase already uses — AES-256-GCM, a fresh IV per seal, payload =
 * base64(iv || tag || ciphertext) — under a dedicated key.
 *
 * The reason this is encryption and not hashing is worth stating once: a TOTP
 * secret is a symmetric key, not a credential the user proves knowledge of.
 * The server recomputes the same HMAC the phone does, so it needs the secret
 * back in the clear. Passwords are hashed precisely because the server never
 * needs them back; applying that reflex here would produce a second factor
 * that cannot verify anything.
 *
 * `MfaRepository` is the only permitted injection site — ciphertext must not
 * reach a service, DTO or contract.
 */
@Injectable()
export class MfaCryptoService {
  private readonly config: MfaCryptoConfig;

  constructor(configService: ConfigService) {
    this.config = resolveMfaCryptoConfig(configService);
  }

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  get keyVersion(): number {
    return this.config.keyVersion;
  }

  /** Seals one TOTP secret; throws when the encryption key is not set. */
  sealTotpSecret(plaintextSecret: string): SealedTotpSecret {
    const encryptionKey = this.requireEncryptionKey();
    const initialisationVector = randomBytes(INITIALISATION_VECTOR_LENGTH_BYTES);
    const cipher = createCipheriv(CIPHER_ALGORITHM, encryptionKey, initialisationVector);
    const encrypted = Buffer.concat([cipher.update(plaintextSecret, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([initialisationVector, cipher.getAuthTag(), encrypted]).toString(
        'base64',
      ),
      keyVersion: this.config.keyVersion,
    };
  }

  /**
   * Decrypts one TOTP secret. Throws when the auth tag does not verify, so a
   * tampered ciphertext can never be silently turned into a secret that
   * validates nothing.
   */
  revealTotpSecret(ciphertext: string): string {
    const encryptionKey = this.requireEncryptionKey();
    const payload = Buffer.from(ciphertext, 'base64');
    if (payload.length <= INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
      throw new Error('TOTP secret ciphertext is malformed');
    }
    const initialisationVector = payload.subarray(0, INITIALISATION_VECTOR_LENGTH_BYTES);
    const authTag = payload.subarray(
      INITIALISATION_VECTOR_LENGTH_BYTES,
      INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
    );
    const encrypted = payload.subarray(INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const decipher = createDecipheriv(CIPHER_ALGORITHM, encryptionKey, initialisationVector);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private requireEncryptionKey(): Buffer {
    if (this.config.encryptionKey === null) {
      throw new Error(
        'MFA crypto configuration error: MFA_SECRET_ENCRYPTION_KEY must be set before enrolling a second factor',
      );
    }
    return this.config.encryptionKey;
  }
}
