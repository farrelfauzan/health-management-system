import { LabReportWorkerConfig } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

const DEFAULT_WORKER_POLL_INTERVAL_MS = 5_000;

const DEFAULT_WORKER_BATCH_SIZE = 3;

const DEFAULT_LEASE_MS = 120_000;

const DEFAULT_MAX_ATTEMPTS = 5;

const DEFAULT_RETRY_BASE_DELAY_MS = 30_000;

/**
 * Resolves the report worker's knobs from the environment at boot (P18-T05).
 *
 * The same six the delivery outbox reads, under a `LAB_REPORT_` prefix, and
 * the same defaults: a render is a sidecar round-trip like a send, and a
 * clinic that has tuned one has the right expectations of the other. Unset
 * means the default; a value that does not parse means the default too — a
 * worker that refused to boot over a typo would leave every released order
 * without its sheet.
 */
export function resolveLabReportWorkerConfig(configService: ConfigService): LabReportWorkerConfig {
  return {
    workerEnabled: readBooleanFlag(configService, 'LAB_REPORT_WORKER_ENABLED', true),
    workerPollIntervalMs: readPositiveInteger(
      configService,
      'LAB_REPORT_WORKER_POLL_INTERVAL_MS',
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
    workerBatchSize: readPositiveInteger(
      configService,
      'LAB_REPORT_WORKER_BATCH_SIZE',
      DEFAULT_WORKER_BATCH_SIZE,
    ),
    leaseMs: readPositiveInteger(configService, 'LAB_REPORT_LEASE_MS', DEFAULT_LEASE_MS),
    maxAttempts: readPositiveInteger(configService, 'LAB_REPORT_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'LAB_REPORT_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
  };
}

function readBooleanFlag(configService: ConfigService, key: string, fallback: boolean): boolean {
  const rawValue = configService.get<string>(key)?.trim().toLowerCase() ?? '';
  if (rawValue !== 'true' && rawValue !== 'false') {
    return fallback;
  }
  return rawValue === 'true';
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key)?.trim() ?? '';
  if (rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
