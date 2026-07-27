import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoConfig } from './national-identifier-crypto.types';

const REQUIRED_KEY_LENGTH_BYTES = 32;
const DEFAULT_KEY_VERSION = 1;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function decodeKey(rawValue: string, key: string): Buffer {
  const trimmedValue = rawValue.trim();
  const decoded = HEX_KEY_PATTERN.test(trimmedValue)
    ? Buffer.from(trimmedValue, 'hex')
    : Buffer.from(trimmedValue, 'base64');
  if (decoded.length !== REQUIRED_KEY_LENGTH_BYTES) {
    throw new Error(
      `Identifier crypto configuration error: ${key} must decode to ${REQUIRED_KEY_LENGTH_BYTES} bytes (base64 or hex)`,
    );
  }
  return decoded;
}

function readKey(configService: ConfigService, key: string): Buffer {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    throw new Error(`Identifier crypto configuration error: ${key} must be set`);
  }
  return decodeKey(rawValue, key);
}

function readKeyVersion(configService: ConfigService): number {
  const rawValue = configService.get<string>('PATIENT_PII_KEY_VERSION');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_KEY_VERSION;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      'Identifier crypto configuration error: PATIENT_PII_KEY_VERSION must be a positive integer',
    );
  }
  return parsed;
}

/**
 * Resolves and validates the patient identifier encryption keys at startup.
 * Both keys are deliberately distinct from `AI_PROVIDER_ENCRYPTION_KEY`: they
 * have a different purpose, rotation cadence, and blast radius on leak.
 */
export function resolveNationalIdentifierCryptoConfig(
  configService: ConfigService,
): NationalIdentifierCryptoConfig {
  const encryptionKey = readKey(configService, 'PATIENT_PII_ENCRYPTION_KEY');
  const indexKey = readKey(configService, 'PATIENT_PII_INDEX_KEY');
  if (encryptionKey.equals(indexKey)) {
    throw new Error(
      'Identifier crypto configuration error: PATIENT_PII_ENCRYPTION_KEY and PATIENT_PII_INDEX_KEY must differ',
    );
  }
  return {
    encryptionKey,
    indexKey,
    keyVersion: readKeyVersion(configService),
  };
}
