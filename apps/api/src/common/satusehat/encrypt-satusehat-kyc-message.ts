import { constants, createCipheriv, publicEncrypt, randomBytes } from 'node:crypto';

import { SATUSEHAT_KYC_ARMOUR } from './satusehat-kyc-armour';
import { EncryptSatusehatKycMessageInput } from './satusehat.types';

const AES_KEY_LENGTH_BYTES = 32;
const INITIALISATION_VECTOR_LENGTH_BYTES = 12;
const CIPHER_ALGORITHM = 'aes-256-gcm';
const OAEP_HASH = 'sha256';

/**
 * SATUSEHAT's hybrid encryption for one KYC request body (FR-KYC-01).
 *
 * A fresh AES-256 key and a fresh 12-byte IV per call; the body is sealed with
 * AES-256-GCM, the AES key is wrapped with the platform's RSA public key
 * (OAEP, SHA-256), and the four parts are concatenated in the platform's
 * order — wrapped key, IV, ciphertext, 16-byte GCM tag — base64-encoded and
 * armoured. Nothing here is reused between calls, so a captured body never
 * helps with the next one.
 */
export function encryptSatusehatKycMessage(input: EncryptSatusehatKycMessageInput): string {
  const aesKey = randomBytes(AES_KEY_LENGTH_BYTES);
  const initialisationVector = randomBytes(INITIALISATION_VECTOR_LENGTH_BYTES);
  const cipher = createCipheriv(CIPHER_ALGORITHM, aesKey, initialisationVector);
  const ciphertext = Buffer.concat([cipher.update(input.plaintext, 'utf8'), cipher.final()]);
  const wrappedAesKey = publicEncrypt(
    { key: input.serverPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: OAEP_HASH },
    aesKey,
  );
  const envelope = Buffer.concat([
    wrappedAesKey,
    initialisationVector,
    ciphertext,
    cipher.getAuthTag(),
  ]);
  return `${SATUSEHAT_KYC_ARMOUR.BEGIN}\r\n${envelope.toString('base64')}\r\n${SATUSEHAT_KYC_ARMOUR.END}`;
}
