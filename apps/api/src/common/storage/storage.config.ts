import { ConfigService } from '@nestjs/config';

import { StorageConfig } from './storage.types';

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_BUCKET = 'hms-dev-objects';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
// `text/markdown` and `text/plain` join the defaults for the document store
// (P15-T10): the knowledge-base corpus is authored as Markdown, and a bucket
// that refuses it makes the whole ingestion path unreachable on a default
// deployment. Each feature narrows this list further for its own uploads —
// the document store accepts none of the image types.
const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/markdown',
  'text/plain',
];
const MAX_SIGNED_URL_EXPIRES_IN_SECONDS = 3_600;
const MIME_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Storage configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

function readAllowedMimeTypes(configService: ConfigService): string[] {
  const rawValue = configService.get<string>('S3_ALLOWED_MIME_TYPES');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_ALLOWED_MIME_TYPES;
  }
  const mimeTypes = rawValue
    .split(',')
    .map((mimeType) => mimeType.trim().toLowerCase())
    .filter((mimeType) => mimeType.length > 0);
  if (mimeTypes.length === 0) {
    throw new Error('Storage configuration error: S3_ALLOWED_MIME_TYPES must not be empty');
  }
  const invalidMimeType = mimeTypes.find((mimeType) => !MIME_TYPE_PATTERN.test(mimeType));
  if (invalidMimeType) {
    throw new Error(
      `Storage configuration error: S3_ALLOWED_MIME_TYPES contains invalid value "${invalidMimeType}"`,
    );
  }
  return mimeTypes;
}

function readEndpoint(configService: ConfigService): string | undefined {
  const rawValue = configService.get<string>('S3_ENDPOINT');
  if (rawValue === undefined || rawValue.trim() === '') {
    return undefined;
  }
  try {
    const parsed = new URL(rawValue);
    return parsed.toString();
  } catch {
    throw new Error('Storage configuration error: S3_ENDPOINT must be a valid URL');
  }
}

function readCredentials(configService: ConfigService): {
  accessKeyId?: string;
  secretAccessKey?: string;
} {
  const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
  const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY');
  const hasAccessKeyId = accessKeyId !== undefined && accessKeyId !== '';
  const hasSecretAccessKey = secretAccessKey !== undefined && secretAccessKey !== '';
  if (hasAccessKeyId !== hasSecretAccessKey) {
    throw new Error(
      'Storage configuration error: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together or omitted together to use the default credential provider chain',
    );
  }
  if (!hasAccessKeyId || !hasSecretAccessKey) {
    return {};
  }
  return { accessKeyId, secretAccessKey };
}

/**
 * Resolves and validates typed object-storage configuration from environment
 * values at startup. Throws a descriptive error for invalid configuration.
 */
export function resolveStorageConfig(configService: ConfigService): StorageConfig {
  const region = configService.get<string>('S3_REGION') ?? DEFAULT_REGION;
  const bucket = configService.get<string>('S3_BUCKET') ?? DEFAULT_BUCKET;
  if (region.trim() === '') {
    throw new Error('Storage configuration error: S3_REGION must not be empty');
  }
  if (bucket.trim() === '') {
    throw new Error('Storage configuration error: S3_BUCKET must not be empty');
  }
  const signedUrlExpiresInSeconds = readPositiveInteger(
    configService,
    'S3_SIGNED_URL_EXPIRES_IN_SECONDS',
    DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS,
  );
  if (signedUrlExpiresInSeconds > MAX_SIGNED_URL_EXPIRES_IN_SECONDS) {
    throw new Error(
      `Storage configuration error: S3_SIGNED_URL_EXPIRES_IN_SECONDS must not exceed ${MAX_SIGNED_URL_EXPIRES_IN_SECONDS}`,
    );
  }
  const credentials = readCredentials(configService);
  return {
    region,
    bucket,
    endpoint: readEndpoint(configService),
    forcePathStyle: configService.get<string>('S3_FORCE_PATH_STYLE') === 'true',
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    requestTimeoutMs: readPositiveInteger(
      configService,
      'S3_REQUEST_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    signedUrlExpiresInSeconds,
    maxUploadSizeBytes: readPositiveInteger(
      configService,
      'S3_MAX_UPLOAD_SIZE_BYTES',
      DEFAULT_MAX_UPLOAD_SIZE_BYTES,
    ),
    allowedMimeTypes: readAllowedMimeTypes(configService),
  };
}
