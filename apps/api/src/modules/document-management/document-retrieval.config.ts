import { ConfigService } from '@nestjs/config';

import { DocumentRetrievalConfig } from '@hms/shared-types';

const DEFAULT_CANDIDATE_LIMIT = 20;
const DEFAULT_MAX_PASSAGES = 5;
/** The conventional RRF constant; see `fuseByReciprocalRank` for what it does. */
const DEFAULT_RANK_CONSTANT = 60;
const DEFAULT_MIN_PASSAGE_CHARACTERS = 40;

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key);
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Document retrieval configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Resolves hybrid retrieval's tuning at startup.
 *
 * There is no enable flag here on purpose. Retrieval mechanics belong to the
 * document store, but *whether a chat exchange uses them* is a chat decision
 * and lives behind `AI_CHAT_RETRIEVAL_ENABLED` in the chatbot module — the
 * same split the customer-service channel will need when it retrieves from
 * this same corpus without going through `AiChatbotService` at all.
 *
 * `maxPassages` must not exceed `candidateLimit`: asking fusion for more
 * passages than either half was allowed to return cannot produce them, and a
 * configuration that says otherwise is describing a corpus nobody will get.
 */
export function resolveDocumentRetrievalConfig(
  configService: ConfigService,
): DocumentRetrievalConfig {
  const candidateLimit = readPositiveInteger(
    configService,
    'DOCUMENT_RETRIEVAL_CANDIDATE_LIMIT',
    DEFAULT_CANDIDATE_LIMIT,
  );
  const maxPassages = readPositiveInteger(
    configService,
    'DOCUMENT_RETRIEVAL_MAX_PASSAGES',
    DEFAULT_MAX_PASSAGES,
  );
  if (maxPassages > candidateLimit) {
    throw new Error(
      'Document retrieval configuration error: DOCUMENT_RETRIEVAL_MAX_PASSAGES must not exceed DOCUMENT_RETRIEVAL_CANDIDATE_LIMIT',
    );
  }
  return {
    candidateLimit,
    maxPassages,
    rankConstant: readPositiveInteger(
      configService,
      'DOCUMENT_RETRIEVAL_RANK_CONSTANT',
      DEFAULT_RANK_CONSTANT,
    ),
    minPassageCharacters: readPositiveInteger(
      configService,
      'DOCUMENT_RETRIEVAL_MIN_PASSAGE_CHARACTERS',
      DEFAULT_MIN_PASSAGE_CHARACTERS,
    ),
  };
}
