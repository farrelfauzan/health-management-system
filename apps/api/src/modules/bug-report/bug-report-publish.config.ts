import { ConfigService } from '@nestjs/config';

import { BugReportPublishConfig } from './bug-report-triage.types';

const DEFAULT_WORKER_POLL_INTERVAL_MS = 20_000;
const DEFAULT_WORKER_BATCH_SIZE = 3;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_DELAY_MS = 60_000;
/**
 * The retention `docs/security/ai-vendor-dpa.md` §5c proposes: 30 days after a
 * report is published, 7 after it is held.
 *
 * Defaults rather than constants, because §5c is explicit that retention is a
 * controller's decision and nobody has made it yet — so the code implements the
 * proposal and leaves a variable for whoever eventually owns it. The asymmetry is
 * the point: published text is kept long enough to re-triage a ticket that turned
 * out to matter, while held text is kept only as long as it takes somebody to
 * look at why it was held, because it is held precisely because it may name a
 * person.
 */
const DEFAULT_PUBLISHED_TEXT_RETENTION_DAYS = 30;

const DEFAULT_HELD_TEXT_RETENTION_DAYS = 7;

const MAX_CLINIC_LABEL_LENGTH = 120;

/**
 * Resolves the Bug Board publishing settings (P23-T10).
 *
 * `BUG_REPORT_CLINIC_LABEL` is required once `NOTION_API_TOKEN` is set, and the
 * coupling is deliberate: the Bug Board is one board shared by every deployment,
 * so a ticket that does not say which clinic it came from is a ticket nobody can
 * triage. Failing at boot is the only moment anybody is watching — the
 * alternative is discovering it weeks later as a column of blanks.
 *
 * A deployment with no Notion credentials needs no label and boots without one.
 */
export function resolveBugReportPublishConfig(
  configService: ConfigService,
): BugReportPublishConfig {
  return {
    clinicLabel: readClinicLabel(configService),
    workerEnabled: readBooleanFlag(configService, 'BUG_REPORT_PUBLISH_WORKER_ENABLED', true),
    workerPollIntervalMs: readPositiveInteger(
      configService,
      'BUG_REPORT_PUBLISH_POLL_INTERVAL_MS',
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
    workerBatchSize: readPositiveInteger(
      configService,
      'BUG_REPORT_PUBLISH_BATCH_SIZE',
      DEFAULT_WORKER_BATCH_SIZE,
    ),
    leaseMs: readPositiveInteger(configService, 'BUG_REPORT_PUBLISH_LEASE_MS', DEFAULT_LEASE_MS),
    maxAttempts: readPositiveInteger(
      configService,
      'BUG_REPORT_PUBLISH_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
    ),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'BUG_REPORT_PUBLISH_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
    publishedTextRetentionDays: readPositiveInteger(
      configService,
      'BUG_REPORT_PUBLISHED_TEXT_RETENTION_DAYS',
      DEFAULT_PUBLISHED_TEXT_RETENTION_DAYS,
    ),
    heldTextRetentionDays: readPositiveInteger(
      configService,
      'BUG_REPORT_HELD_TEXT_RETENTION_DAYS',
      DEFAULT_HELD_TEXT_RETENTION_DAYS,
    ),
  };
}

function readClinicLabel(configService: ConfigService): string {
  const clinicLabel = readOptionalValue(configService, 'BUG_REPORT_CLINIC_LABEL');
  const isNotionConfigured = readOptionalValue(configService, 'NOTION_API_TOKEN') !== undefined;
  if (clinicLabel === undefined) {
    if (isNotionConfigured) {
      throw new Error(
        'Bug report configuration error: BUG_REPORT_CLINIC_LABEL is required when NOTION_API_TOKEN is set, so Bug Board tickets say which clinic filed them',
      );
    }
    return '';
  }
  if (clinicLabel.length > MAX_CLINIC_LABEL_LENGTH) {
    throw new Error(
      `Bug report configuration error: BUG_REPORT_CLINIC_LABEL must be at most ${MAX_CLINIC_LABEL_LENGTH} characters`,
    );
  }
  return clinicLabel;
}

/** Empty reads as absent — an unconfigured GitHub secret expands to `""`. */
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
    throw new Error(`Bug report configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}
