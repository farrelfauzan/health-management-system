import { ConfigService } from '@nestjs/config';

import { StorageConfig } from './storage.types';

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_BUCKET = 'hms-dev-objects';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
// The bucket ceiling, not a surface's limit. It sits at the largest cap any
// shipped surface declares — the document store's 20 MiB (P16-T03), sized for
// a scanned multi-page radiology report — and every surface narrows it from
// there in its own schema (`DOCUMENT_MAX_UPLOAD_SIZE_BYTES`,
// `CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES`, which is 2 MiB). Raising this alone
// widens nothing: a request is refused by the surface's own `.max()` before
// it ever reaches the signing call.
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
// The union of what the two uploading surfaces accept, and no wider. The
// document store (P15-T10) takes the three text-ish types; the clinic logo
// (P16-T02) takes the three image types.
//
// Image types were removed from this default under SJ-21 with the condition
// that an image-bearing feature re-add them *in the same change that adds its
// re-encode* — which is what P16-T02 did (`common/image/reencode-image.ts`,
// called at confirm time before anything is kept). The condition still binds
// the next surface: a bucket that quietly accepts a type no feature validates
// is standing room for one that skips the step.
//
// Widening this list never widens what may be uploaded as a document or as a
// logo. Each surface declares its own allowlist in `@hms/shared-types`
// (`DOCUMENT_UPLOAD_MIME_TYPES`, `CLINIC_LOGO_UPLOAD_MIME_TYPES`) and is
// checked against it before this one is consulted.
const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  // P16-T42: a Word file staged for template import. Validated on its bytes
  // (ZIP signature, `word/document.xml` present), converted, and deleted in
  // the same request — it is never served and never kept.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
