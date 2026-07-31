import { ConfigService } from '@nestjs/config';

import { AiProviderAdapterConfig } from './ai-provider.types';

const DEFAULT_MAX_RETRY_ATTEMPTS = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS = 30_000;

function readNonNegativeInteger(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const rawValue = configService.get<string>(key)?.trim();
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`AI provider configuration error: ${key} must be a non-negative integer`);
  }
  return parsed;
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const parsed = readNonNegativeInteger(configService, key, fallback);
  if (parsed === 0) {
    throw new Error(`AI provider configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Resolves the deployment-level resilience settings for provider calls. The
 * per-call timeout and token budget deliberately do NOT live here — they are
 * per-config database columns, because a clinic on a slow self-hosted Ollama
 * needs a different budget than one on a cloud API. Retries default to one:
 * a chat user is waiting synchronously, so a second attempt at an
 * unreachable upstream is worth one connection error, not a backoff ladder.
 */
export function resolveAiProviderAdapterConfig(
  configService: ConfigService,
): AiProviderAdapterConfig {
  return {
    maxRetryAttempts: readNonNegativeInteger(
      configService,
      'AI_PROVIDER_MAX_RETRY_ATTEMPTS',
      DEFAULT_MAX_RETRY_ATTEMPTS,
    ),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'AI_PROVIDER_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
    circuitBreakerFailureThreshold: readPositiveInteger(
      configService,
      'AI_PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    ),
    circuitBreakerOpenDurationMs: readPositiveInteger(
      configService,
      'AI_PROVIDER_CIRCUIT_BREAKER_OPEN_DURATION_MS',
      DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS,
    ),
  };
}
