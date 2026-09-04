import { UserOffboardingConfig } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

const DEFAULT_WEB_APP_BASE_URL = 'http://localhost:3000';
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const DEFAULT_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function normaliseBaseUrl(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

function readSweepIntervalMs(configService: ConfigService): number {
  const rawValue = configService.get<string>('OFFBOARDING_SWEEP_INTERVAL_MS');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_SWEEP_INTERVAL_MS;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      'Offboarding configuration error: OFFBOARDING_SWEEP_INTERVAL_MS must be a positive integer',
    );
  }
  return parsed;
}

/**
 * Where the offboarding emails link, which calendar the deadline is counted
 * in, and how the sweep runs (`P16-T41`).
 *
 * The web origin is `WEB_APP_BASE_URL`, the same variable invitation links
 * use and for the same reason: the link lands on a Next.js page, so it cannot
 * be derived from the API's own request. The sweep defaults **on**, unlike
 * ingestion's — it needs only the database and the mail transport, and a
 * deletion that quietly never happens is a promise the product made and did
 * not keep.
 */
export function resolveUserOffboardingConfig(configService: ConfigService): UserOffboardingConfig {
  const configuredBaseUrl = configService.get<string>('WEB_APP_BASE_URL')?.trim() ?? '';
  return {
    webAppBaseUrl: normaliseBaseUrl(
      configuredBaseUrl === '' ? DEFAULT_WEB_APP_BASE_URL : configuredBaseUrl,
    ),
    clinicTimeZone: configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE,
    isSweepEnabled: configService.get<string>('OFFBOARDING_SWEEP_ENABLED') !== 'false',
    sweepIntervalMs: readSweepIntervalMs(configService),
  };
}
