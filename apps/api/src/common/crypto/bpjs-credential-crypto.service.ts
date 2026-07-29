import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveBpjsCredentialCryptoConfig } from './bpjs-credential-crypto.config';
import { BpjsCredentialCryptoConfig, SealedCredential } from './bpjs-credential-crypto.types';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const INITIALISATION_VECTOR_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const MASK_VISIBLE_CHARACTERS = 4;

/**
 * Encrypts the facility's BPJS PCare credentials at rest — consumer secret,
 * user key, and the clinic's real PCare password, the most sensitive secret
 * in the system (it can create and delete claims). Same sealed-value layout
 * as {@link NationalIdentifierCryptoService} (AES-256-GCM, random IV per
 * seal, payload = base64(iv || tag || ciphertext)) under a dedicated key. No
 * blind index exists: credentials are never looked up by value. Repositories
 * are the only layer allowed to inject this service.
 */
@Injectable()
export class BpjsCredentialCryptoService {
  private readonly config: BpjsCredentialCryptoConfig;

  constructor(configService: ConfigService) {
    this.config = resolveBpjsCredentialCryptoConfig(configService);
  }

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  get keyVersion(): number {
    return this.config.keyVersion;
  }

  /** Seals one credential value; throws when the encryption key is not set. */
  sealCredential(plaintextValue: string): SealedCredential {
    const encryptionKey = this.requireEncryptionKey();
    const initialisationVector = randomBytes(INITIALISATION_VECTOR_LENGTH_BYTES);
    const cipher = createCipheriv(CIPHER_ALGORITHM, encryptionKey, initialisationVector);
    const encrypted = Buffer.concat([cipher.update(plaintextValue, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([initialisationVector, cipher.getAuthTag(), encrypted]).toString(
        'base64',
      ),
      keyVersion: this.config.keyVersion,
    };
  }

  /**
   * Decrypts one credential. Throws when the auth tag does not verify, so a
   * tampered or truncated ciphertext can never be silently returned.
   */
  revealCredential(ciphertext: string): string {
    const encryptionKey = this.requireEncryptionKey();
    const payload = Buffer.from(ciphertext, 'base64');
    if (payload.length <= INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
      throw new Error('BPJS credential ciphertext is malformed');
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

  /** Derives the masked display suffix stored next to the ciphertext. */
  maskCredential(plaintextValue: string): string {
    return plaintextValue.slice(-MASK_VISIBLE_CHARACTERS);
  }

  private requireEncryptionKey(): Buffer {
    if (this.config.encryptionKey === null) {
      throw new Error(
        'BPJS credential crypto configuration error: BPJS_CREDENTIAL_ENCRYPTION_KEY must be set before storing BPJS credentials',
      );
    }
    return this.config.encryptionKey;
  }
}
