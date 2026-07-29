import { ConfigService } from '@nestjs/config';

import { BpjsCredentialCryptoConfig } from './bpjs-credential-crypto.types';

const REQUIRED_KEY_LENGTH_BYTES = 32;
const DEFAULT_KEY_VERSION = 1;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function decodeKey(rawValue: string): Buffer {
  const trimmedValue = rawValue.trim();
  const decoded = HEX_KEY_PATTERN.test(trimmedValue)
    ? Buffer.from(trimmedValue, 'hex')
    : Buffer.from(trimmedValue, 'base64');
  if (decoded.length !== REQUIRED_KEY_LENGTH_BYTES) {
    throw new Error(
      `BPJS credential crypto configuration error: BPJS_CREDENTIAL_ENCRYPTION_KEY must decode to ${REQUIRED_KEY_LENGTH_BYTES} bytes (base64 or hex)`,
    );
  }
  return decoded;
}

function readKeyVersion(configService: ConfigService): number {
  const rawValue = configService.get<string>('BPJS_CREDENTIAL_KEY_VERSION');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_KEY_VERSION;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      'BPJS credential crypto configuration error: BPJS_CREDENTIAL_KEY_VERSION must be a positive integer',
    );
  }
  return parsed;
}

/**
 * Resolves the BPJS credential encryption key at startup. Unlike the patient
 * PII keys the key is optional: most deployments have no BPJS bridging, so a
 * missing key must not stop boot — storing credentials then fails with a
 * typed `BPJS_PCARE_NOT_CONFIGURED` error instead. The key is deliberately
 * distinct from `PATIENT_PII_ENCRYPTION_KEY` (different purpose, rotation
 * cadence, and blast radius on leak).
 */
export function resolveBpjsCredentialCryptoConfig(
  configService: ConfigService,
): BpjsCredentialCryptoConfig {
  const rawValue = configService.get<string>('BPJS_CREDENTIAL_ENCRYPTION_KEY');
  if (rawValue === undefined || rawValue.trim() === '') {
    return { isConfigured: false, encryptionKey: null, keyVersion: readKeyVersion(configService) };
  }
  return {
    isConfigured: true,
    encryptionKey: decodeKey(rawValue),
    keyVersion: readKeyVersion(configService),
  };
}
