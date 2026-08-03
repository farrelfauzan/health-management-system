import { ConfigService } from '@nestjs/config';

import { DocumentIngestionConfig } from '@hms/shared-types';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_POLL_BATCH_LIMIT = 3;
const DEFAULT_MAX_CHUNK_CHARACTERS = 2_000;
const DEFAULT_CHUNK_OVERLAP_CHARACTERS = 200;
const DEFAULT_MAX_CHUNKS_PER_DOCUMENT = 400;

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Document ingestion configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Resolves the ingestion pipeline's configuration at startup.
 *
 * `DOCUMENT_INGESTION_ENABLED` defaults **off**, like every other worker flag
 * here: with it off nothing polls, documents rest at `PENDING`, and a
 * deployment without a reachable Ollama boots without a background loop
 * failing every fifteen seconds. Turning it on is the deliberate act that
 * says an embedding host exists.
 */
export function resolveDocumentIngestionConfig(
  configService: ConfigService,
): DocumentIngestionConfig {
  const maxChunkCharacters = readPositiveInteger(
    configService,
    'DOCUMENT_INGESTION_MAX_CHUNK_CHARACTERS',
    DEFAULT_MAX_CHUNK_CHARACTERS,
  );
  const chunkOverlapCharacters = readPositiveInteger(
    configService,
    'DOCUMENT_INGESTION_CHUNK_OVERLAP_CHARACTERS',
    DEFAULT_CHUNK_OVERLAP_CHARACTERS,
  );
  if (chunkOverlapCharacters >= maxChunkCharacters) {
    throw new Error(
      'Document ingestion configuration error: DOCUMENT_INGESTION_CHUNK_OVERLAP_CHARACTERS must be smaller than DOCUMENT_INGESTION_MAX_CHUNK_CHARACTERS',
    );
  }
  return {
    isEnabled: configService.get<string>('DOCUMENT_INGESTION_ENABLED') === 'true',
    pollIntervalMs: readPositiveInteger(
      configService,
      'DOCUMENT_INGESTION_POLL_INTERVAL_MS',
      DEFAULT_POLL_INTERVAL_MS,
    ),
    pollBatchLimit: readPositiveInteger(
      configService,
      'DOCUMENT_INGESTION_POLL_BATCH_LIMIT',
      DEFAULT_POLL_BATCH_LIMIT,
    ),
    maxChunkCharacters,
    chunkOverlapCharacters,
    maxChunksPerDocument: readPositiveInteger(
      configService,
      'DOCUMENT_INGESTION_MAX_CHUNKS_PER_DOCUMENT',
      DEFAULT_MAX_CHUNKS_PER_DOCUMENT,
    ),
  };
}
