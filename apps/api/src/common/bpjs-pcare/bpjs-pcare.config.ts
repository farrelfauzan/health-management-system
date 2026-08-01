import { ConfigService } from '@nestjs/config';

import { resolveBpjsGatewayAdapterConfig } from '../bpjs-gateway/resolve-bpjs-gateway-adapter-config';
import { BpjsPcareAdapterConfig } from './bpjs-pcare.types';

const SERVICE_LABEL = 'BPJS PCare';
const ENV_PREFIX = 'BPJS_PCARE';
const DEFAULT_DEVELOPMENT_BASE_URL = 'https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev';
const DEFAULT_PRODUCTION_BASE_URL = 'https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0';
const DEFAULT_WORKER_POLL_INTERVAL_MS = 15_000;
const DEFAULT_SUBMISSION_MAX_ATTEMPTS = 8;
const DEFAULT_SUBMISSION_RETRY_BASE_DELAY_MS = 60_000;

function readOptionalValue(configService: ConfigService, key: string): string | undefined {
  const rawValue = configService.get<string>(key)?.trim();
  return rawValue === undefined || rawValue === '' ? undefined : rawValue;
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = readOptionalValue(configService, key);
  if (rawValue === undefined) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${SERVICE_LABEL} configuration error: ${key} must be a positive integer`);
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
 * startup. The hosts and the resilience policy come from the shared gateway
 * resolver — every BPJS service enforces the same policy; what stays here is
 * the submission worker, which is PCare's alone (P11-T05).
 */
export function resolveBpjsPcareAdapterConfig(
  configService: ConfigService,
): BpjsPcareAdapterConfig {
  return {
    ...resolveBpjsGatewayAdapterConfig({
      configService,
      serviceLabel: SERVICE_LABEL,
      envPrefix: ENV_PREFIX,
      developmentBaseUrlFallback: DEFAULT_DEVELOPMENT_BASE_URL,
      productionBaseUrlFallback: DEFAULT_PRODUCTION_BASE_URL,
    }),
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
