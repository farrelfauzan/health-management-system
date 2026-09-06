import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_DELIVERY_PASSWORD_SOURCE,
  DELIVERY_PASSWORD_SOURCES,
  DOCUMENT_CATEGORIES,
  DeliveryPasswordSourceValue,
  DocumentCategoryValue,
  DocumentDeliveryConfig,
  deliveryPasswordSourceSchema,
  documentCategorySchema,
} from '@hms/shared-types';

const HOURS_PER_DAY = 24;
const DEFAULT_LINK_TTL_DAYS = 7;
const MAX_LINK_TTL_DAYS = 30;
const DEFAULT_WEB_APP_BASE_URL = 'http://localhost:3000';
const DEFAULT_WORKER_POLL_INTERVAL_MS = 5_000;
const DEFAULT_WORKER_BATCH_SIZE = 3;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_DELAY_MS = 30_000;
/**
 * The categories that dispatch on release unless the clinician says
 * otherwise (`P16-T40`, FR-E4-28): a result the patient is waiting for. A
 * consent form or an identity scan is filed, not sent.
 */
const DEFAULT_DISPATCH_CATEGORIES: readonly DocumentCategoryValue[] = ['LAB_RESULT', 'RADIOLOGY'];

/**
 * Resolves delivery configuration from the environment at boot.
 *
 * `DELIVERY_PDF_PASSWORD_SOURCE` (`P16-T37`) picks how an attachment's
 * password is derived (FR-E4-06). Unset means the date-of-birth default; a
 * value outside the known schemes is a boot error rather than a per-send
 * surprise, because a clinic that set it wrong would otherwise ship documents
 * no patient can open — with the message telling them the wrong thing to
 * type.
 *
 * `DELIVERY_LINK_TTL_DAYS` (`P16-T25`) is how long a LINK delivery's token
 * resolves (FR-E4-11, default 7). Capped at 30: a link that lives longer than
 * a month is a link nobody can remember sending. `WEB_APP_BASE_URL` is the
 * origin the link lands on — the same variable staff invitations use, for the
 * same reason: the page is a Next.js route that then calls the API, so the
 * origin cannot be derived from the request that created the delivery.
 */
export function resolveDocumentDeliveryConfig(
  configService: ConfigService,
): DocumentDeliveryConfig {
  return {
    passwordSource: readPasswordSource(configService),
    linkTtlHours: readLinkTtlDays(configService) * HOURS_PER_DAY,
    webAppBaseUrl: readWebAppBaseUrl(configService),
    workerEnabled: readBooleanFlag(configService, 'DELIVERY_WORKER_ENABLED', true),
    workerPollIntervalMs: readPositiveInteger(
      configService,
      'DELIVERY_WORKER_POLL_INTERVAL_MS',
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
    workerBatchSize: readPositiveInteger(
      configService,
      'DELIVERY_WORKER_BATCH_SIZE',
      DEFAULT_WORKER_BATCH_SIZE,
    ),
    leaseMs: readPositiveInteger(configService, 'DELIVERY_LEASE_MS', DEFAULT_LEASE_MS),
    maxAttempts: readPositiveInteger(configService, 'DELIVERY_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
    retryBaseDelayMs: readPositiveInteger(
      configService,
      'DELIVERY_RETRY_BASE_DELAY_MS',
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
    dailySendCap: readOptionalPositiveInteger(configService, 'DELIVERY_DAILY_SEND_CAP'),
    dispatchDefaultCategories: readDispatchDefaultCategories(configService),
  };
}

/**
 * `DELIVERY_DISPATCH_DEFAULT_CATEGORIES` (`P16-T40`): a comma-separated list
 * of `DocumentCategory` values. Unset keeps the built-in pair; a value the
 * catalog does not know is a boot error, because a misspelled category would
 * silently stop lab results going out.
 */
function readDispatchDefaultCategories(
  configService: ConfigService,
): readonly DocumentCategoryValue[] {
  const rawValue = configService.get<string>('DELIVERY_DISPATCH_DEFAULT_CATEGORIES')?.trim() ?? '';
  if (rawValue === '') {
    return DEFAULT_DISPATCH_CATEGORIES;
  }
  const categories = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const parsed = categories.map((entry) => documentCategorySchema.safeParse(entry));
  if (parsed.some((result) => !result.success)) {
    throw new Error(
      `Document delivery configuration error: DELIVERY_DISPATCH_DEFAULT_CATEGORIES must list values from ${DOCUMENT_CATEGORIES.join(', ')}`,
    );
  }
  return [...new Set(parsed.flatMap((result) => (result.success ? [result.data] : [])))];
}

function readBooleanFlag(configService: ConfigService, key: string, fallback: boolean): boolean {
  const rawValue = configService.get<string>(key)?.trim().toLowerCase() ?? '';
  if (rawValue !== 'true' && rawValue !== 'false') {
    return fallback;
  }
  return rawValue === 'true';
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const parsed = readOptionalPositiveInteger(configService, key);
  return parsed ?? fallback;
}

/** Unset, empty or unusable reads as "not configured" — never as zero. */
function readOptionalPositiveInteger(configService: ConfigService, key: string): number | null {
  const rawValue = configService.get<string>(key)?.trim() ?? '';
  if (rawValue === '') {
    return null;
  }
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readPasswordSource(configService: ConfigService): DeliveryPasswordSourceValue {
  const rawSource = configService.get<string>('DELIVERY_PDF_PASSWORD_SOURCE');
  if (rawSource === undefined || rawSource.trim() === '') {
    return DEFAULT_DELIVERY_PASSWORD_SOURCE;
  }
  const parsed = deliveryPasswordSourceSchema.safeParse(rawSource.trim());
  if (!parsed.success) {
    throw new Error(
      `Document delivery configuration error: DELIVERY_PDF_PASSWORD_SOURCE must be one of ${DELIVERY_PASSWORD_SOURCES.join(', ')}`,
    );
  }
  return parsed.data;
}

function readLinkTtlDays(configService: ConfigService): number {
  const rawValue = configService.get<string>('DELIVERY_LINK_TTL_DAYS')?.trim() ?? '';
  if (rawValue === '') {
    return DEFAULT_LINK_TTL_DAYS;
  }
  const parsed = Number(rawValue);
  const isUsable = Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_LINK_TTL_DAYS;
  if (!isUsable) {
    throw new Error(
      `Document delivery configuration error: DELIVERY_LINK_TTL_DAYS must be a whole number of days between 1 and ${MAX_LINK_TTL_DAYS}`,
    );
  }
  return parsed;
}

function readWebAppBaseUrl(configService: ConfigService): string {
  const configured = configService.get<string>('WEB_APP_BASE_URL')?.trim() ?? '';
  const value = configured === '' ? DEFAULT_WEB_APP_BASE_URL : configured;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}
