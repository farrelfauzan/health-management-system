import { DocumentApprovalConfig } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

const DEFAULT_WEB_APP_BASE_URL = 'http://localhost:3000';

const DEFAULT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

const DEFAULT_DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

const DEFAULT_SWEEP_BATCH_SIZE = 200;

function normaliseBaseUrl(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

function readPositiveInteger(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Document approval configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Where approval mail links, and how often the deadline sweep runs
 * (`P16-T30`).
 *
 * The sweep defaults **on**, like offboarding's and unlike ingestion's: it
 * needs only the database and the mail transport, and a deadline that
 * quietly never produces a reminder makes the deadline field a lie. It
 * sweeps every fifteen minutes rather than hourly because the claim stamps
 * make a re-run a no-op, so a shorter interval costs one indexed query and
 * buys a tighter reminder.
 */
export function resolveDocumentApprovalConfig(
  configService: ConfigService,
): DocumentApprovalConfig {
  const configuredBaseUrl = configService.get<string>('WEB_APP_BASE_URL')?.trim() ?? '';
  return {
    webAppBaseUrl: normaliseBaseUrl(
      configuredBaseUrl === '' ? DEFAULT_WEB_APP_BASE_URL : configuredBaseUrl,
    ),
    isSweepEnabled: configService.get<string>('DOCUMENT_APPROVAL_SWEEP_ENABLED') !== 'false',
    sweepIntervalMs: readPositiveInteger(
      configService,
      'DOCUMENT_APPROVAL_SWEEP_INTERVAL_MS',
      DEFAULT_SWEEP_INTERVAL_MS,
    ),
    dueSoonWindowMs: readPositiveInteger(
      configService,
      'DOCUMENT_APPROVAL_DUE_SOON_WINDOW_MS',
      DEFAULT_DUE_SOON_WINDOW_MS,
    ),
    sweepBatchSize: readPositiveInteger(
      configService,
      'DOCUMENT_APPROVAL_SWEEP_BATCH_SIZE',
      DEFAULT_SWEEP_BATCH_SIZE,
    ),
  };
}
