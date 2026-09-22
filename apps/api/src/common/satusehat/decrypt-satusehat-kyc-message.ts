import { constants, createDecipheriv, privateDecrypt } from 'node:crypto';

import { SATUSEHAT_KYC_ARMOUR } from './satusehat-kyc-armour';
import { DecryptSatusehatKycMessageInput } from './satusehat.types';

const INITIALISATION_VECTOR_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const BITS_PER_BYTE = 8;
const CIPHER_ALGORITHM = 'aes-256-gcm';
const OAEP_HASH = 'sha256';

/**
 * The inverse of `encryptSatusehatKycMessage`, for the platform's answer: the
 * platform wraps its AES key with the public key we sent in the request, so
 * only the deployment's private key opens it.
 *
 * The wrapped key is as long as the RSA modulus, which is read off the key
 * rather than assumed to be 256 bytes — a 4096-bit pair would otherwise fail
 * with an authentication error that says nothing about why. Whitespace inside
 * the armour is ignored, because the platform folds its base64 and the width
 * is not part of the contract. Throws on a malformed envelope or a failed GCM
 * tag; a tampered response can never be returned as if it were read.
 */
export function decryptSatusehatKycMessage(input: DecryptSatusehatKycMessageInput): string {
  const body = input.armoured
    .replace(SATUSEHAT_KYC_ARMOUR.BEGIN, '')
    .replace(SATUSEHAT_KYC_ARMOUR.END, '')
    .replace(/\s+/g, '');
  const envelope = Buffer.from(body, 'base64');
  const modulusLength = input.privateKey.asymmetricKeyDetails?.modulusLength;
  if (modulusLength === undefined) {
    throw new Error('SATUSEHAT KYC private key has no modulus length');
  }
  const wrappedKeyLength = modulusLength / BITS_PER_BYTE;
  const minimumLength =
    wrappedKeyLength + INITIALISATION_VECTOR_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES;
  if (envelope.length < minimumLength) {
    throw new Error('SATUSEHAT KYC response envelope is truncated');
  }
  const aesKey = privateDecrypt(
    { key: input.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: OAEP_HASH },
    envelope.subarray(0, wrappedKeyLength),
  );
  const message = envelope.subarray(wrappedKeyLength);
  const initialisationVector = message.subarray(0, INITIALISATION_VECTOR_LENGTH_BYTES);
  const ciphertext = message.subarray(INITIALISATION_VECTOR_LENGTH_BYTES, -AUTH_TAG_LENGTH_BYTES);
  const authTag = message.subarray(-AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(CIPHER_ALGORITHM, aesKey, initialisationVector);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
