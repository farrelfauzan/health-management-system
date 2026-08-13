import { ConfigService } from '@nestjs/config';

import { MfaCryptoConfig } from './mfa-crypto.types';

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
      `MFA crypto configuration error: MFA_SECRET_ENCRYPTION_KEY must decode to ${REQUIRED_KEY_LENGTH_BYTES} bytes (base64 or hex)`,
    );
  }
  return decoded;
}

function readKeyVersion(configService: ConfigService): number {
  const rawValue = configService.get<string>('MFA_SECRET_KEY_VERSION');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_KEY_VERSION;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      'MFA crypto configuration error: MFA_SECRET_KEY_VERSION must be a positive integer',
    );
  }
  return parsed;
}

/**
 * Resolves the TOTP secret encryption key at startup (SJ-8).
 *
 * The key is optional *here* and required in production by
 * `validateEnvironment`, and the split matters. Development and CI run
 * hundreds of tests that never touch MFA, so demanding a key from them buys
 * nothing. Production is the opposite case: without the key nobody can enrol,
 * which means `MfaEnforcementService` has to leave enforcement off, which means
 * a deployment could quietly run with the whole feature disabled. Refusing to
 * boot is how that stops being quiet.
 *
 * The key is deliberately distinct from every other encryption key in the
 * system. Its blast radius is different in kind: leaking it does not expose
 * patient data, it degrades every privileged account back to a password.
 */
export function resolveMfaCryptoConfig(configService: ConfigService): MfaCryptoConfig {
  const rawValue = configService.get<string>('MFA_SECRET_ENCRYPTION_KEY');
  if (rawValue === undefined || rawValue.trim() === '') {
    return { isConfigured: false, encryptionKey: null, keyVersion: readKeyVersion(configService) };
  }
  return {
    isConfigured: true,
    encryptionKey: decodeKey(rawValue),
    keyVersion: readKeyVersion(configService),
  };
}
