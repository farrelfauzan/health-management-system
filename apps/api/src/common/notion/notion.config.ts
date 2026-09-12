import { ConfigService } from '@nestjs/config';

import { NotionConfig } from './notion.types';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
/** Notion allows an integration roughly three requests per second. */
const DEFAULT_MAX_REQUESTS_PER_SECOND = 3;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS = 30_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const DASHLESS_UUID_LENGTH = 32;

/**
 * Reads one setting, treating an empty string exactly like an absent one.
 *
 * That equivalence is the point: GitHub Actions expands an unconfigured secret
 * to `""` rather than leaving the variable unset, so `??` alone would hand the
 * adapter a token that is present, empty, and rejected by Notion at the first
 * call.
 */
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
    throw new Error(`Notion configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Normalises a data source id to the dashed form the API paths use. Accepts
 * the dashless form because that is what Notion's URLs carry, so an operator
 * copying an id out of the browser does not have to reformat it.
 */
function normaliseDataSourceId(rawValue: string): string {
  if (!UUID_PATTERN.test(rawValue)) {
    throw new Error(
      'Notion configuration error: NOTION_BUG_BOARD_DATA_SOURCE_ID must be a UUID, with or without dashes',
    );
  }
  const dashless = rawValue.replace(/-/g, '').toLowerCase();
  if (dashless.length !== DASHLESS_UUID_LENGTH) {
    throw new Error(
      'Notion configuration error: NOTION_BUG_BOARD_DATA_SOURCE_ID must be a UUID, with or without dashes',
    );
  }
  return [
    dashless.slice(0, 8),
    dashless.slice(8, 12),
    dashless.slice(12, 16),
    dashless.slice(16, 20),
    dashless.slice(20),
  ].join('-');
}

/**
 * The token and the board are set together or not at all. Half a credential
 * is never a working deployment, and the failure it produces later — a 401 at
 * the first bug report, hours after the deploy — is far harder to read than a
 * refusal to start.
 */
function readCredentials(configService: ConfigService): {
  apiToken?: string;
  bugBoardDataSourceId?: string;
} {
  const apiToken = readOptionalValue(configService, 'NOTION_API_TOKEN');
  const rawDataSourceId = readOptionalValue(configService, 'NOTION_BUG_BOARD_DATA_SOURCE_ID');
  if (apiToken !== undefined && rawDataSourceId === undefined) {
    throw new Error(
      'Notion configuration error: NOTION_BUG_BOARD_DATA_SOURCE_ID is required when NOTION_API_TOKEN is set',
    );
  }
  if (apiToken === undefined && rawDataSourceId !== undefined) {
    throw new Error(
      'Notion configuration error: NOTION_API_TOKEN is required when NOTION_BUG_BOARD_DATA_SOURCE_ID is set',
    );
  }
  if (apiToken === undefined || rawDataSourceId === undefined) {
    return {};
  }
  return { apiToken, bugBoardDataSourceId: normaliseDataSourceId(rawDataSourceId) };
}

/**
 * Resolves and validates the Notion connector settings at startup (P23-T02).
 *
 * The configuration is environment-only on purpose: the Bug Board belongs to
 * Saling Jaga, not to the clinic, so a clinic administrator must not be able
 * to read the token or redirect where bug reports go. There is no admin form
 * and no database row behind this.
 *
 * A deployment with no Notion variables boots normally and reports itself not
 * configured; bug reports then wait in the outbox instead of failing. Every
 * message raised here names the offending variable and never prints its value.
 */
export function resolveNotionConfig(configService: ConfigService): NotionConfig {
  const credentials = readCredentials(configService);
  return {
    isConfigured: credentials.apiToken !== undefined,
    apiToken: credentials.apiToken,
    bugBoardDataSourceId: credentials.bugBoardDataSourceId,
    requestTimeoutMs: readPositiveInteger(
      configService,
      'NOTION_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    maxRequestsPerSecond: readPositiveInteger(
      configService,
      'NOTION_MAX_REQUESTS_PER_SECOND',
      DEFAULT_MAX_REQUESTS_PER_SECOND,
    ),
    circuitBreakerFailureThreshold: readPositiveInteger(
      configService,
      'NOTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    ),
    circuitBreakerOpenDurationMs: readPositiveInteger(
      configService,
      'NOTION_CIRCUIT_BREAKER_OPEN_DURATION_MS',
      DEFAULT_CIRCUIT_BREAKER_OPEN_DURATION_MS,
    ),
  };
}
