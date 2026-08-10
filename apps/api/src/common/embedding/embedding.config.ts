import { ConfigService } from '@nestjs/config';

import {
  EMBEDDING_PROVIDER_KINDS,
  EmbeddingProviderConfig,
  EmbeddingProviderKind,
} from './embedding.types';

const DEFAULT_PROVIDER_KIND: EmbeddingProviderKind = 'TOGETHER';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'bge-m3';

const DEFAULT_TOGETHER_BASE_URL = 'https://api.together.xyz';
/**
 * 1024 dimensions and genuinely multilingual, which is the pair that matters.
 *
 * The width is what keeps this a config change rather than a migration — the
 * corpus column is `vector(1024)`, the same width `bge-m3` produces. The
 * multilinguality is what keeps `PCS-T02`'s cross-lingual property: an
 * Indonesian question finding an English passage is the behaviour that chose
 * the local model in the first place, and Together's English-only embedders
 * (`BAAI/bge-large-en-v1.5` and friends) would have given it up silently while
 * still fitting the column.
 */
const DEFAULT_TOGETHER_MODEL = 'intfloat/multilingual-e5-large-instruct';

const DEFAULT_VERSION = '1';
const DEFAULT_DIMENSION = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BATCH_SIZE = 16;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RETRY_DELAY_MS = 10_000;

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Embedding configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Separate from {@link readPositiveInteger} because zero is a meaningful
 * retry budget — "try once, never again" is a deployment an operator may
 * legitimately want, and folding it into the positive-integer reader would
 * silently replace it with the default.
 */
function readNonNegativeInteger(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Embedding configuration error: ${key} must be a non-negative integer`);
  }
  return parsed;
}

function readNonEmptyString(configService: ConfigService, key: string, fallback: string): string {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  return rawValue.trim();
}

function readBaseUrl(configService: ConfigService, key: string, fallback: string): string {
  const rawValue = readNonEmptyString(configService, key, fallback);
  try {
    // Trailing slashes are stripped so an adapter can append its own path
    // without producing a double slash the provider would 404 on.
    return new URL(rawValue).toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Embedding configuration error: ${key} must be a valid URL`);
  }
}

/**
 * Reads `EMBEDDING_PROVIDER`, defaulting to the hosted provider (`PCS-T12`).
 *
 * An unrecognised value **throws rather than falling back**, which is the
 * opposite of how `WA_GATEWAY_KIND` treats one. The asymmetry is deliberate:
 * picking the wrong WhatsApp bridge sends a message through the wrong pipe and
 * the customer still gets it, whereas picking the wrong embedder silently
 * decides which company sees the clinic's documents. A typo must not be
 * resolved by guessing.
 */
function readProviderKind(configService: ConfigService): EmbeddingProviderKind {
  const rawValue = configService.get<string>('EMBEDDING_PROVIDER')?.trim().toUpperCase();
  if (rawValue === undefined || rawValue === '') {
    return DEFAULT_PROVIDER_KIND;
  }
  const matched = EMBEDDING_PROVIDER_KINDS.find((kind) => kind === rawValue);
  if (matched === undefined) {
    throw new Error(
      `Embedding configuration error: EMBEDDING_PROVIDER must be one of ${EMBEDDING_PROVIDER_KINDS.join(', ')}`,
    );
  }
  return matched;
}

/**
 * Resolves every embedding provider's configuration at startup.
 *
 * Deliberately separate from `AiProviderConfig`, which is the admin-managed
 * *chat* provider: embeddings are a property of the stored corpus, not of the
 * conversation, and coupling them would make swapping a chat vendor silently
 * invalidate every vector in the database. The vector width is fixed in the
 * column type, so changing the embedding model is a migration and a re-ingest
 * — not a settings screen.
 *
 * The **version defaults are shared** across the two providers on purpose.
 * `version` exists to disambiguate a model whose name did not change; the
 * model *name* already disambiguates the providers, and it is stamped on every
 * chunk beside the version. Two vector spaces can never collide on a stamp.
 */
export function resolveEmbeddingConfig(configService: ConfigService): EmbeddingProviderConfig {
  return {
    kind: readProviderKind(configService),
    ollama: {
      baseUrl: readBaseUrl(configService, 'OLLAMA_EMBEDDING_BASE_URL', DEFAULT_OLLAMA_BASE_URL),
      model: readNonEmptyString(configService, 'OLLAMA_EMBEDDING_MODEL', DEFAULT_OLLAMA_MODEL),
      version: readNonEmptyString(configService, 'OLLAMA_EMBEDDING_VERSION', DEFAULT_VERSION),
      dimension: readPositiveInteger(
        configService,
        'OLLAMA_EMBEDDING_DIMENSION',
        DEFAULT_DIMENSION,
      ),
      timeoutMs: readPositiveInteger(
        configService,
        'OLLAMA_EMBEDDING_TIMEOUT_MS',
        DEFAULT_TIMEOUT_MS,
      ),
      maxBatchSize: readPositiveInteger(
        configService,
        'OLLAMA_EMBEDDING_BATCH_SIZE',
        DEFAULT_MAX_BATCH_SIZE,
      ),
    },
    together: {
      baseUrl: readBaseUrl(configService, 'TOGETHER_EMBEDDING_BASE_URL', DEFAULT_TOGETHER_BASE_URL),
      // Read but never validated for shape, and never logged. An empty key is
      // refused by the adapter at call time rather than here, so an API whose
      // operator has not finished configuring embeddings still boots and still
      // serves every route that does not need one.
      apiKey: readNonEmptyString(configService, 'TOGETHER_API_KEY', ''),
      model: readNonEmptyString(configService, 'TOGETHER_EMBEDDING_MODEL', DEFAULT_TOGETHER_MODEL),
      version: readNonEmptyString(configService, 'TOGETHER_EMBEDDING_VERSION', DEFAULT_VERSION),
      dimension: readPositiveInteger(
        configService,
        'TOGETHER_EMBEDDING_DIMENSION',
        DEFAULT_DIMENSION,
      ),
      timeoutMs: readPositiveInteger(
        configService,
        'TOGETHER_EMBEDDING_TIMEOUT_MS',
        DEFAULT_TIMEOUT_MS,
      ),
      maxBatchSize: readPositiveInteger(
        configService,
        'TOGETHER_EMBEDDING_BATCH_SIZE',
        DEFAULT_MAX_BATCH_SIZE,
      ),
      maxRetries: readNonNegativeInteger(
        configService,
        'TOGETHER_EMBEDDING_MAX_RETRIES',
        DEFAULT_MAX_RETRIES,
      ),
      maxRetryDelayMs: readPositiveInteger(
        configService,
        'TOGETHER_EMBEDDING_MAX_RETRY_DELAY_MS',
        DEFAULT_MAX_RETRY_DELAY_MS,
      ),
    },
  };
}
