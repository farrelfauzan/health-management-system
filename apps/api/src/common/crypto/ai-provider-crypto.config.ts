import { ConfigService } from '@nestjs/config';

import { AiProviderCryptoConfig } from './ai-provider-crypto.types';

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
      `AI provider crypto configuration error: AI_PROVIDER_ENCRYPTION_KEY must decode to ${REQUIRED_KEY_LENGTH_BYTES} bytes (base64 or hex)`,
    );
  }
  return decoded;
}

function readKeyVersion(configService: ConfigService): number {
  const rawValue = configService.get<string>('AI_PROVIDER_KEY_VERSION');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_KEY_VERSION;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      'AI provider crypto configuration error: AI_PROVIDER_KEY_VERSION must be a positive integer',
    );
  }
  return parsed;
}

/**
 * Resolves the AI provider API-key encryption key at startup. Like the BPJS
 * credential key the key is optional: most deployments run without the
 * chatbot, so a missing key must not stop boot — storing a provider API key
 * then fails with a typed `AI_NOT_CONFIGURED` error instead. The key is
 * deliberately distinct from `BPJS_CREDENTIAL_ENCRYPTION_KEY` (different
 * upstream, rotation cadence, and blast radius on leak), even though both
 * follow the same sealed-value layout so one rotation runbook covers both.
 */
export function resolveAiProviderCryptoConfig(configService: ConfigService): AiProviderCryptoConfig {
  const rawValue = configService.get<string>('AI_PROVIDER_ENCRYPTION_KEY');
  if (rawValue === undefined || rawValue.trim() === '') {
    return { isConfigured: false, encryptionKey: null, keyVersion: readKeyVersion(configService) };
  }
  return {
    isConfigured: true,
    encryptionKey: decodeKey(rawValue),
    keyVersion: readKeyVersion(configService),
  };
}
