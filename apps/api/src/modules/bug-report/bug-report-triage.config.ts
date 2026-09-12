import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER_KINDS, AiProviderKindValue, aiProviderKindSchema } from '@hms/shared-types';

import { BugReportTriageConfig } from './bug-report-triage.types';

const DEFAULT_WORKER_POLL_INTERVAL_MS = 15_000;
const DEFAULT_WORKER_BATCH_SIZE = 3;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_DELAY_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 2_048;
/**
 * How long a report may sit un-triaged before it is published on the reporter's
 * own words instead.
 *
 * The ticket's "nothing stays in RECEIVED longer than a set limit". A report is
 * worth most on the day it is filed, and a vendor outage that outlives this is
 * not a reason to hold a bug back — it is a reason to file it as FALLBACK and
 * let a human read the reporter's redacted text.
 */
const DEFAULT_STALE_AFTER_MS = 3_600_000;

/**
 * Reads the Saling Jaga-owned triage settings (P23-T09).
 *
 * These are deliberately **not** the clinic's `AiProviderConfig` row, and the
 * separation is a product decision rather than a technical one: that row is the
 * clinic's chat provider — the clinic's bill, a DPA written for chat, and a
 * switch the clinic may turn off. A bug report has to reach us precisely when
 * the clinic has turned things off, so triage runs on our key or not at all.
 *
 * A deployment with no `BUG_TRIAGE_AI_*` variables is a supported state, not a
 * failure: `isConfigured` is false, the worker skips the vendor call entirely,
 * and every report is settled as FALLBACK carrying the reporter's redacted
 * words. The board still fills up; the tickets are just written by the person
 * who filed them.
 */
export function resolveBugReportTriageConfig(configService: ConfigService): BugReportTriageConfig {
  const provider = readProvider(configService);
  return {
    ...provider,
    workerEnabled: readBooleanFlag(configService, 'BUG_TRIAGE_WORKER_ENABLED', true),
    workerPollIntervalMs: readPositiveInteger(
      configService,
      'BUG_TRIAGE_WORKER_POLL_INTERVAL_MS',
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
    workerBatchSize: readPositiveInteger(
      configService,
      'BUG_TRIAGE_WORKER_BATCH_SIZE',
      DEFAULT_WORKER_BATCH_SIZE,
    ),
    leaseMs: readPositiveInteger(configService, 'BUG_TRIAGE_LEASE_MS', DEFAULT_LEASE_MS),
    maxAttempts: readPositiveInteger(
      configService,
      'BUG_TRIAGE_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
    ),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'BUG_TRIAGE_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
    staleAfterMs: readPositiveInteger(
      configService,
      'BUG_TRIAGE_STALE_AFTER_MS',
      DEFAULT_STALE_AFTER_MS,
    ),
  };
}

/**
 * The provider half: all of it or none of it.
 *
 * A kind without a model, or either without a key, is never a working
 * deployment — it is a deployment that boots, looks configured, and fails at
 * the first report hours later. Refusing to start says the same thing at the
 * one moment somebody is watching the logs.
 *
 * `OLLAMA` is the exception on the key, exactly as the chat resolver has it: a
 * self-hosted upstream legitimately has no credential.
 */
function readProvider(
  configService: ConfigService,
): Pick<
  BugReportTriageConfig,
  'isConfigured' | 'providerKind' | 'model' | 'apiKey' | 'baseUrl' | 'timeoutMs' | 'maxTokens'
> {
  const rawKind = readOptionalValue(configService, 'BUG_TRIAGE_AI_PROVIDER_KIND');
  const model = readOptionalValue(configService, 'BUG_TRIAGE_AI_MODEL');
  const apiKey = readOptionalValue(configService, 'BUG_TRIAGE_AI_API_KEY');
  const baseUrl = readOptionalValue(configService, 'BUG_TRIAGE_AI_BASE_URL');
  const timeoutMs = readPositiveInteger(
    configService,
    'BUG_TRIAGE_AI_TIMEOUT_MS',
    DEFAULT_TIMEOUT_MS,
  );
  const maxTokens = readPositiveInteger(
    configService,
    'BUG_TRIAGE_AI_MAX_TOKENS',
    DEFAULT_MAX_TOKENS,
  );
  if (rawKind === undefined && model === undefined && apiKey === undefined) {
    return {
      isConfigured: false,
      providerKind: null,
      model: null,
      apiKey: null,
      baseUrl: null,
      timeoutMs,
      maxTokens,
    };
  }
  const providerKind = parseProviderKind(rawKind);
  if (model === undefined) {
    throw new Error(
      'Bug triage configuration error: BUG_TRIAGE_AI_MODEL is required when BUG_TRIAGE_AI_PROVIDER_KIND is set',
    );
  }
  if (apiKey === undefined && providerKind !== 'OLLAMA') {
    throw new Error(
      `Bug triage configuration error: BUG_TRIAGE_AI_API_KEY is required for provider kind ${providerKind}`,
    );
  }
  return {
    isConfigured: true,
    providerKind,
    model,
    apiKey: apiKey ?? null,
    baseUrl: baseUrl ?? null,
    timeoutMs,
    maxTokens,
  };
}

function parseProviderKind(rawKind: string | undefined): AiProviderKindValue {
  if (rawKind === undefined) {
    throw new Error(
      'Bug triage configuration error: BUG_TRIAGE_AI_PROVIDER_KIND is required when any other BUG_TRIAGE_AI_* variable is set',
    );
  }
  const parsed = aiProviderKindSchema.safeParse(rawKind);
  if (!parsed.success) {
    throw new Error(
      `Bug triage configuration error: BUG_TRIAGE_AI_PROVIDER_KIND must be one of ${AI_PROVIDER_KINDS.join(', ')}`,
    );
  }
  return parsed.data;
}

/**
 * Reads one setting, treating an empty string exactly like an absent one —
 * GitHub Actions expands an unconfigured secret to `""` rather than leaving it
 * unset, so `??` alone would hand the adapter a present, empty, rejected key.
 */
function readOptionalValue(configService: ConfigService, key: string): string | undefined {
  const rawValue = configService.get<string>(key)?.trim();
  return rawValue === undefined || rawValue === '' ? undefined : rawValue;
}

function readBooleanFlag(configService: ConfigService, key: string, fallback: boolean): boolean {
  const rawValue = readOptionalValue(configService, key)?.toLowerCase();
  if (rawValue !== 'true' && rawValue !== 'false') {
    return fallback;
  }
  return rawValue === 'true';
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = readOptionalValue(configService, key);
  if (rawValue === undefined) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Bug triage configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}
