import { ConfigService } from '@nestjs/config';

import { EmbeddingConfig } from './embedding.types';

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'bge-m3';
const DEFAULT_VERSION = '1';
const DEFAULT_DIMENSION = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BATCH_SIZE = 16;

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

function readNonEmptyString(configService: ConfigService, key: string, fallback: string): string {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  return rawValue.trim();
}

function readBaseUrl(configService: ConfigService): string {
  const rawValue = readNonEmptyString(configService, 'OLLAMA_EMBEDDING_BASE_URL', DEFAULT_BASE_URL);
  try {
    // Trailing slashes are stripped so the adapter can append `/api/embed`
    // without producing a double slash the provider would 404 on.
    return new URL(rawValue).toString().replace(/\/+$/, '');
  } catch {
    throw new Error('Embedding configuration error: OLLAMA_EMBEDDING_BASE_URL must be a valid URL');
  }
}

/**
 * Resolves the local embedding configuration at startup.
 *
 * Deliberately separate from `AiProviderConfig`, which is the admin-managed
 * *chat* provider: embeddings are a property of the stored corpus, not of the
 * conversation, and coupling them would make swapping a chat vendor silently
 * invalidate every vector in the database. The vector width is fixed in the
 * column type, so changing the embedding model is a migration and a re-ingest
 * — not a settings screen.
 */
export function resolveEmbeddingConfig(configService: ConfigService): EmbeddingConfig {
  return {
    baseUrl: readBaseUrl(configService),
    model: readNonEmptyString(configService, 'OLLAMA_EMBEDDING_MODEL', DEFAULT_MODEL),
    version: readNonEmptyString(configService, 'OLLAMA_EMBEDDING_VERSION', DEFAULT_VERSION),
    dimension: readPositiveInteger(configService, 'OLLAMA_EMBEDDING_DIMENSION', DEFAULT_DIMENSION),
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
  };
}
