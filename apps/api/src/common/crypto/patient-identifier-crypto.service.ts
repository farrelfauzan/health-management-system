import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolvePatientIdentifierCryptoConfig } from './patient-identifier-crypto.config';
import {
  EncryptedIdentifier,
  PatientIdentifierCryptoConfig,
  SealedIdentifier,
} from './patient-identifier-crypto.types';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const INITIALISATION_VECTOR_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const MASK_VISIBLE_DIGITS = 4;

/**
 * Encrypts and blind-indexes patient national/payer identifiers.
 *
 * Ciphertext uses AES-256-GCM with a random IV per row, so the same NIK never
 * produces the same ciphertext twice. Because that makes equality lookup and
 * uniqueness impossible, every searchable identifier is additionally stored as
 * an HMAC-SHA256 blind index keyed with a secret pepper — an unkeyed digest
 * would be brute-forceable, since name, date of birth and address sit in
 * plaintext in the same row and fix all but the last four NIK digits.
 */
@Injectable()
export class PatientIdentifierCryptoService {
  private readonly config: PatientIdentifierCryptoConfig;

  constructor(configService: ConfigService) {
    this.config = resolvePatientIdentifierCryptoConfig(configService);
  }

  get keyVersion(): number {
    return this.config.keyVersion;
  }

  /**
   * Encrypts a normalised identifier into its ciphertext, blind index and
   * masked-display columns. The caller is responsible for normalising first.
   */
  encryptSearchableIdentifier(normalisedValue: string): EncryptedIdentifier {
    return {
      ciphertext: this.seal(normalisedValue),
      index: this.computeBlindIndex(normalisedValue),
      last4: normalisedValue.slice(-MASK_VISIBLE_DIGITS),
      keyVersion: this.config.keyVersion,
    };
  }

  /**
   * Encrypts an identifier that is only ever retrieved, never searched.
   */
  encryptSealedIdentifier(normalisedValue: string): SealedIdentifier {
    return {
      ciphertext: this.seal(normalisedValue),
      keyVersion: this.config.keyVersion,
    };
  }

  /**
   * Decrypts an identifier. Throws when the auth tag does not verify, so a
   * tampered or truncated ciphertext can never be silently returned.
   */
  decryptIdentifier(ciphertext: string): string {
    const payload = Buffer.from(ciphertext, 'base64');
    if (payload.length <= INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
      throw new Error('Patient identifier ciphertext is malformed');
    }
    const initialisationVector = payload.subarray(0, INITIALISATION_VECTOR_LENGTH_BYTES);
    const authTag = payload.subarray(
      INITIALISATION_VECTOR_LENGTH_BYTES,
      INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
    );
    const encrypted = payload.subarray(INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const decipher = createDecipheriv(CIPHER_ALGORITHM, this.config.encryptionKey, initialisationVector);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  /**
   * Derives the deterministic lookup value for a normalised identifier.
   */
  computeBlindIndex(normalisedValue: string): string {
    return createHmac('sha256', this.config.indexKey).update(normalisedValue, 'utf8').digest('base64');
  }

  /**
   * Constant-time comparison of two blind indexes.
   */
  matchesBlindIndex(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'base64');
    const rightBuffer = Buffer.from(right, 'base64');
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private seal(normalisedValue: string): string {
    const initialisationVector = randomBytes(INITIALISATION_VECTOR_LENGTH_BYTES);
    const cipher = createCipheriv(CIPHER_ALGORITHM, this.config.encryptionKey, initialisationVector);
    const encrypted = Buffer.concat([cipher.update(normalisedValue, 'utf8'), cipher.final()]);
    return Buffer.concat([initialisationVector, cipher.getAuthTag(), encrypted]).toString('base64');
  }
}
