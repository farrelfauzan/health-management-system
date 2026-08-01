import { ConfigService } from '@nestjs/config';

import { BpjsGatewayResiliencePolicy } from './bpjs-gateway.types';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS = 30_000;

function readOptionalValue(configService: ConfigService, key: string): string | undefined {
  const rawValue = configService.get<string>(key)?.trim();
  return rawValue === undefined || rawValue === '' ? undefined : rawValue;
}

function readBaseUrl(params: {
  readonly configService: ConfigService;
  readonly serviceLabel: string;
  readonly key: string;
  readonly fallback: string;
}): string {
  const rawValue = readOptionalValue(params.configService, params.key) ?? params.fallback;
  try {
    new URL(rawValue);
  } catch {
    throw new Error(
      `${params.serviceLabel} configuration error: ${params.key} must be a valid URL`,
    );
  }
  return rawValue.replace(/\/+$/, '');
}

function readNonNegativeInteger(params: {
  readonly configService: ConfigService;
  readonly serviceLabel: string;
  readonly key: string;
  readonly fallback: number;
}): number {
  const rawValue = readOptionalValue(params.configService, params.key);
  if (rawValue === undefined) {
    return params.fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `${params.serviceLabel} configuration error: ${params.key} must be a non-negative integer`,
    );
  }
  return parsed;
}

function readPositiveInteger(params: {
  readonly configService: ConfigService;
  readonly serviceLabel: string;
  readonly key: string;
  readonly fallback: number;
}): number {
  const parsed = readNonNegativeInteger(params);
  if (parsed === 0) {
    throw new Error(
      `${params.serviceLabel} configuration error: ${params.key} must be a positive integer`,
    );
  }
  return parsed;
}

/**
 * Resolves the part of a BPJS service adapter's configuration that every
 * service has: the two environment base URLs and the resilience policy the
 * shared transport enforces. Credentials never appear here — they are
 * per-facility database rows, so the environment only carries hosts and
 * policy.
 *
 * Each service supplies its own env-key prefix (`BPJS_PCARE`, `BPJS_ANTREAN`)
 * and its own base-URL defaults, because BPJS issues the services separately
 * and has issued differently-shaped dev hosts over time (ADR D-022) — confirm
 * the defaults against the facility's credential issuance letter and override
 * when they differ.
 */
export function resolveBpjsGatewayAdapterConfig(params: {
  readonly configService: ConfigService;
  readonly serviceLabel: string;
  readonly envPrefix: string;
  readonly developmentBaseUrlFallback: string;
  readonly productionBaseUrlFallback: string;
}): BpjsGatewayResiliencePolicy & {
  readonly developmentBaseUrl: string;
  readonly productionBaseUrl: string;
} {
  const { configService, serviceLabel, envPrefix } = params;
  return {
    developmentBaseUrl: readBaseUrl({
      configService,
      serviceLabel,
      key: `${envPrefix}_DEVELOPMENT_BASE_URL`,
      fallback: params.developmentBaseUrlFallback,
    }),
    productionBaseUrl: readBaseUrl({
      configService,
      serviceLabel,
      key: `${envPrefix}_PRODUCTION_BASE_URL`,
      fallback: params.productionBaseUrlFallback,
    }),
    requestTimeoutMs: readPositiveInteger({
      configService,
      serviceLabel,
      key: `${envPrefix}_REQUEST_TIMEOUT_MS`,
      fallback: DEFAULT_REQUEST_TIMEOUT_MS,
    }),
    maxRetryAttempts: readNonNegativeInteger({
      configService,
      serviceLabel,
      key: `${envPrefix}_MAX_RETRY_ATTEMPTS`,
      fallback: DEFAULT_MAX_RETRY_ATTEMPTS,
    }),
    retryBaseDelayMs: readPositiveInteger({
      configService,
      serviceLabel,
      key: `${envPrefix}_RETRY_BASE_DELAY_MS`,
      fallback: DEFAULT_RETRY_BASE_DELAY_MS,
    }),
    circuitBreakerFailureThreshold: readPositiveInteger({
      configService,
      serviceLabel,
      key: `${envPrefix}_CIRCUIT_BREAKER_FAILURE_THRESHOLD`,
      fallback: DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    }),
    circuitBreakerOpenDurationMs: readPositiveInteger({
      configService,
      serviceLabel,
      key: `${envPrefix}_CIRCUIT_BREAKER_OPEN_DURATION_MS`,
      fallback: DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS,
    }),
  };
}
