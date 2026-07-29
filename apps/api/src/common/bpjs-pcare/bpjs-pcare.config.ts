import { ConfigService } from '@nestjs/config';

import { BpjsPcareAdapterConfig } from './bpjs-pcare.types';

const DEFAULT_DEVELOPMENT_BASE_URL = 'https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev';
const DEFAULT_PRODUCTION_BASE_URL = 'https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS = 30_000;
const DEFAULT_WORKER_POLL_INTERVAL_MS = 15_000;
const DEFAULT_SUBMISSION_MAX_ATTEMPTS = 8;
const DEFAULT_SUBMISSION_RETRY_BASE_DELAY_MS = 60_000;

function readOptionalValue(configService: ConfigService, key: string): string | undefined {
  const rawValue = configService.get<string>(key)?.trim();
  return rawValue === undefined || rawValue === '' ? undefined : rawValue;
}

function readBaseUrl(configService: ConfigService, key: string, fallback: string): string {
  const rawValue = readOptionalValue(configService, key) ?? fallback;
  try {
    new URL(rawValue);
  } catch {
    throw new Error(`BPJS PCare configuration error: ${key} must be a valid URL`);
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
    throw new Error(`BPJS PCare configuration error: ${key} must be a non-negative integer`);
  }
  return parsed;
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const parsed = readNonNegativeInteger(configService, key, fallback);
  if (parsed === 0) {
    throw new Error(`BPJS PCare configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

function readBooleanFlag(configService: ConfigService, key: string, fallback: boolean): boolean {
  const rawValue = readOptionalValue(configService, key);
  if (rawValue === undefined) {
    return fallback;
  }
  return rawValue.toLowerCase() !== 'false';
}

/**
 * Resolves the BPJS PCare adapter configuration from environment values at
 * startup. Unlike SATUSEHAT, no credentials live here — they are per-facility
 * database rows (`BpjsPcareConfig`), so the environment only carries base
 * URLs and the resilience policy. The development base URL default follows
 * the current apijkn-dev convention, but BPJS has issued differently-shaped
 * dev hosts over time (ADR D-022) — confirm it against the facility's
 * credential issuance letter and override when it differs.
 */
export function resolveBpjsPcareAdapterConfig(
  configService: ConfigService,
): BpjsPcareAdapterConfig {
  return {
    developmentBaseUrl: readBaseUrl(
      configService,
      'BPJS_PCARE_DEVELOPMENT_BASE_URL',
      DEFAULT_DEVELOPMENT_BASE_URL,
    ),
    productionBaseUrl: readBaseUrl(
      configService,
      'BPJS_PCARE_PRODUCTION_BASE_URL',
      DEFAULT_PRODUCTION_BASE_URL,
    ),
    requestTimeoutMs: readPositiveInteger(
      configService,
      'BPJS_PCARE_REQUEST_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    maxRetryAttempts: readNonNegativeInteger(
      configService,
      'BPJS_PCARE_MAX_RETRY_ATTEMPTS',
      DEFAULT_MAX_RETRY_ATTEMPTS,
    ),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'BPJS_PCARE_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
    circuitBreakerFailureThreshold: readPositiveInteger(
      configService,
      'BPJS_PCARE_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    ),
    circuitBreakerOpenDurationMs: readPositiveInteger(
      configService,
      'BPJS_PCARE_CIRCUIT_BREAKER_OPEN_DURATION_MS',
      DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS,
    ),
    workerEnabled: readBooleanFlag(configService, 'BPJS_WORKER_ENABLED', true),
    workerPollIntervalMs: readPositiveInteger(
      configService,
      'BPJS_WORKER_POLL_INTERVAL_MS',
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
    submissionMaxAttempts: readPositiveInteger(
      configService,
      'BPJS_SUBMISSION_MAX_ATTEMPTS',
      DEFAULT_SUBMISSION_MAX_ATTEMPTS,
    ),
    submissionRetryBaseDelayMs: readPositiveInteger(
      configService,
      'BPJS_SUBMISSION_RETRY_BASE_DELAY_MS',
      DEFAULT_SUBMISSION_RETRY_BASE_DELAY_MS,
    ),
  };
}
