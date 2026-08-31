import { ConfigService } from '@nestjs/config';

import { PdfRendererConfig } from './pdf.types';

/**
 * Empty by default, and deliberately not `http://gotenberg:3000`: that host
 * resolves only inside the compose network, so a default would turn "the
 * sidecar is not deployed" into a DNS failure on every render instead of a
 * configuration error the operator can read.
 */
const DEFAULT_BASE_URL = '';
/**
 * Chromium's own budget for a document is seconds, not minutes. Thirty gives
 * a cold container room to start its browser on the first request while still
 * being short enough that a wedged renderer surfaces as an error inside one
 * request's lifetime rather than holding a connection open.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/**
 * A ceiling on what the API will buffer from the renderer. An invoice is
 * kilobytes; a template that manages to produce tens of megabytes is a bug,
 * and the failure mode of reading it anyway is the API's heap.
 */
const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export const A4_PAPER_WIDTH_INCHES = 8.27;
export const A4_PAPER_HEIGHT_INCHES = 11.69;
export const DEFAULT_PAGE_MARGIN_INCHES = 0.39;

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`PDF renderer configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Normalises the sidecar origin. A trailing slash is stripped so the adapter
 * can append its own path without minting a double slash, and anything that
 * is not a parseable `http(s)` origin is a startup error rather than a
 * per-request surprise.
 */
function readBaseUrl(configService: ConfigService): string {
  const rawValue = configService.get<string>('PDF_RENDERER_BASE_URL');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_BASE_URL;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    throw new Error('PDF renderer configuration error: PDF_RENDERER_BASE_URL must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      'PDF renderer configuration error: PDF_RENDERER_BASE_URL must use http or https',
    );
  }
  return parsed.toString().replace(/\/+$/, '');
}

/**
 * Resolves and validates typed renderer configuration from environment values
 * at startup. Throws a descriptive error for invalid configuration.
 */
export function resolvePdfRendererConfig(configService: ConfigService): PdfRendererConfig {
  return {
    baseUrl: readBaseUrl(configService),
    requestTimeoutMs: readPositiveInteger(
      configService,
      'PDF_RENDERER_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    maxOutputBytes: readPositiveInteger(
      configService,
      'PDF_RENDERER_MAX_OUTPUT_BYTES',
      DEFAULT_MAX_OUTPUT_BYTES,
    ),
  };
}
