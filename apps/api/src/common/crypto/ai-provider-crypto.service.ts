import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveAiProviderCryptoConfig } from './ai-provider-crypto.config';
import { AiProviderCryptoConfig, SealedApiKey } from './ai-provider-crypto.types';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const INITIALISATION_VECTOR_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const HINT_VISIBLE_CHARACTERS = 4;

/**
 * Encrypts clinic-configured AI provider API keys at rest. A stored key is
 * spendable money at an upstream vendor and decides which third party sees
 * chat context, so it gets the same sealed-value layout as
 * {@link BpjsCredentialCryptoService} (AES-256-GCM, random IV per seal,
 * payload = base64(iv || tag || ciphertext)) under a dedicated key. No blind
 * index exists: keys are never looked up by value. Repositories are the only
 * layer allowed to inject this service.
 */
@Injectable()
export class AiProviderCryptoService {
  private readonly config: AiProviderCryptoConfig;

  constructor(configService: ConfigService) {
    this.config = resolveAiProviderCryptoConfig(configService);
  }

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  get keyVersion(): number {
    return this.config.keyVersion;
  }

  /** Seals one API key; throws when the encryption key is not set. */
  sealApiKey(plaintextValue: string): SealedApiKey {
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
   * Decrypts one API key. Throws when the auth tag does not verify, so a
   * tampered or truncated ciphertext can never be silently returned.
   */
  revealApiKey(ciphertext: string): string {
    const encryptionKey = this.requireEncryptionKey();
    const payload = Buffer.from(ciphertext, 'base64');
    if (payload.length <= INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
      throw new Error('AI provider API key ciphertext is malformed');
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

  /** Derives the four-character display hint stored next to the ciphertext. */
  maskApiKey(plaintextValue: string): string {
    return plaintextValue.slice(-HINT_VISIBLE_CHARACTERS);
  }

  private requireEncryptionKey(): Buffer {
    if (this.config.encryptionKey === null) {
      throw new Error(
        'AI provider crypto configuration error: AI_PROVIDER_ENCRYPTION_KEY must be set before storing AI provider API keys',
      );
    }
    return this.config.encryptionKey;
  }
}
