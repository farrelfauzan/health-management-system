import { ConfigService } from '@nestjs/config';

import { SatusehatConfig } from './satusehat.types';

const DEFAULT_FHIR_BASE_URL = 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1';
const DEFAULT_AUTH_BASE_URL = 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS = 30_000;

function readOptionalValue(configService: ConfigService, key: string): string | undefined {
  const rawValue = configService.get<string>(key)?.trim();
  return rawValue === undefined || rawValue === '' ? undefined : rawValue;
}

function readBaseUrl(configService: ConfigService, key: string, fallback: string): string {
  const rawValue = readOptionalValue(configService, key) ?? fallback;
  try {
    new URL(rawValue);
  } catch {
    throw new Error(`SATUSEHAT configuration error: ${key} must be a valid URL`);
  }
  return rawValue.replace(/\/+$/, '');
}

function readNonNegativeInteger(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const rawValue = readOptionalValue(configService, key);
  if (rawValue === undefined) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`SATUSEHAT configuration error: ${key} must be a non-negative integer`);
  }
  return parsed;
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const parsed = readNonNegativeInteger(configService, key, fallback);
  if (parsed === 0) {
    throw new Error(`SATUSEHAT configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

function readCredentials(configService: ConfigService): {
  organizationId?: string;
  clientId?: string;
  clientSecret?: string;
} {
  const organizationId = readOptionalValue(configService, 'SATUSEHAT_ORGANIZATION_ID');
  const clientId = readOptionalValue(configService, 'SATUSEHAT_CLIENT_ID');
  const clientSecret = readOptionalValue(configService, 'SATUSEHAT_CLIENT_SECRET');
  const providedCount = [organizationId, clientId, clientSecret].filter(
    (value) => value !== undefined,
  ).length;
  if (providedCount !== 0 && providedCount !== 3) {
    throw new Error(
      'SATUSEHAT configuration error: SATUSEHAT_ORGANIZATION_ID, SATUSEHAT_CLIENT_ID and SATUSEHAT_CLIENT_SECRET must be set together or omitted together',
    );
  }
  return { organizationId, clientId, clientSecret };
}

/**
 * Resolves and validates typed SATUSEHAT adapter configuration from environment
 * values at startup. Credentials are optional so deployments without a
 * Kemenkes registration still boot; the adapter then refuses calls with
 * `SATUSEHAT_NOT_CONFIGURED` instead of failing at import time. Defaults point
 * at the public staging sandbox, never production. The location pair is
 * independent of the credential trio because the Location resource is
 * registered on the platform after credentials exist — Encounter mapping
 * enforces its presence at map time instead.
 */
export function resolveSatusehatConfig(configService: ConfigService): SatusehatConfig {
  const credentials = readCredentials(configService);
  return {
    isConfigured: credentials.clientId !== undefined,
    fhirBaseUrl: readBaseUrl(configService, 'SATUSEHAT_FHIR_BASE_URL', DEFAULT_FHIR_BASE_URL),
    authBaseUrl: readBaseUrl(configService, 'SATUSEHAT_AUTH_BASE_URL', DEFAULT_AUTH_BASE_URL),
    organizationId: credentials.organizationId,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    locationId: readOptionalValue(configService, 'SATUSEHAT_LOCATION_ID'),
    locationName: readOptionalValue(configService, 'SATUSEHAT_LOCATION_NAME'),
    requestTimeoutMs: readPositiveInteger(
      configService,
      'SATUSEHAT_REQUEST_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    maxRetryAttempts: readNonNegativeInteger(
      configService,
      'SATUSEHAT_MAX_RETRY_ATTEMPTS',
      DEFAULT_MAX_RETRY_ATTEMPTS,
    ),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'SATUSEHAT_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
    circuitBreakerFailureThreshold: readPositiveInteger(
      configService,
      'SATUSEHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    ),
    circuitBreakerOpenDurationMs: readPositiveInteger(
      configService,
      'SATUSEHAT_CIRCUIT_BREAKER_OPEN_DURATION_MS',
      DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS,
    ),
  };
}
