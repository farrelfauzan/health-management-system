import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DocumentRetrievalConfig,
  DocumentVisibilityValue,
  RetrieveDocumentChunksParams,
  RetrievedDocumentChunk,
} from '@hms/shared-types';

import { EmbeddingService } from '../../../common/embedding/embedding.service';
import { resolveDocumentRetrievalConfig } from '../document-retrieval.config';
import { DocumentRetrievalRepository } from '../repository/document-retrieval.repository';
import { fuseByReciprocalRank } from './fuse-by-reciprocal-rank';

export type RetrieveDocumentPassagesParams = {
  /** The user's question, verbatim. */
  query: string;
  /** The asking channel's own visibility; `BOTH` is always admitted with it. */
  channelVisibility: Exclude<DocumentVisibilityValue, 'BOTH'>;
  /**
   * The asking user, whose personal knowledge base joins the candidate set.
   * `null` for a channel whose users have no personal corpus — the personal
   * half then contributes nothing rather than being outranked.
   */
  ownerUserId: string | null;
};

/**
 * Hybrid retrieval over the shared document store (`P15-T11`,
 * ai-chatbot-tools.md §5.3): embed the question, run the vector and full-text
 * halves over one candidate set, fuse by reciprocal rank, return the top
 * passages.
 *
 * This lives in `document-management` rather than in the chatbot because the
 * corpus does: the WA/Telegram channel retrieves from the same documents
 * without going through `AiChatbotService`, and a second copy of the scope
 * predicate is how one of them would eventually answer with a staff-only SOP.
 *
 * **Retrieval is not a tool the model calls** (§5.5). It runs before the
 * completion, like context enrichment, which is what keeps the exchange
 * deterministic and one round trip — and keeps the retrieved text recorded
 * before transmission, exactly like everything else that reaches a processor.
 */
@Injectable()
export class DocumentRetrievalService {
  private readonly logger = new Logger(DocumentRetrievalService.name);
  private readonly retrievalConfig: DocumentRetrievalConfig;

  constructor(
    configService: ConfigService,
    private readonly embeddingService: EmbeddingService,
    private readonly retrievalRepository: DocumentRetrievalRepository,
  ) {
    this.retrievalConfig = resolveDocumentRetrievalConfig(configService);
  }

  get config(): DocumentRetrievalConfig {
    return this.retrievalConfig;
  }

  /**
   * Runs one retrieval. Throws on an unreachable embedder or a failed query —
   * the caller decides what a miss means, and for chat that is "answer as
   * today" rather than "fail the exchange".
   *
   * The embedding failure is deliberately **not** degraded to a lexical-only
   * search. Half a hybrid still returns confident answers, and it returns them
   * to a corpus whose whole cross-lingual half has silently stopped working —
   * the exact "reads as the feature getting worse" failure §5.4 is written to
   * avoid. Retrieving nothing is visible; retrieving worse is not.
   */
  async retrievePassages(
    params: RetrieveDocumentPassagesParams,
  ): Promise<RetrievedDocumentChunk[]> {
    const trimmedQuery = params.query.trim();
    if (trimmedQuery === '') {
      return [];
    }
    const embedded = await this.embeddingService.embedTexts({ texts: [trimmedQuery] });
    const queryEmbedding = embedded.embeddings[0];
    if (queryEmbedding === undefined) {
      throw new Error('Embedding provider returned no vector for the query');
    }
    const searchParams: RetrieveDocumentChunksParams = {
      queryText: trimmedQuery,
      queryEmbedding,
      embeddingModel: embedded.model,
      embeddingVersion: embedded.version,
      channelVisibility: params.channelVisibility,
      ownerUserId: params.ownerUserId,
      candidateLimit: this.retrievalConfig.candidateLimit,
    };
    // Both halves see the same candidate set and are independent, so they run
    // together: the exchange waits for the slower one, not for their sum.
    const [vectorCandidates, fullTextCandidates] = await Promise.all([
      this.retrievalRepository.searchByVector(searchParams),
      this.retrievalRepository.searchByFullText(searchParams),
    ]);
    const fused = fuseByReciprocalRank({
      rankedLists: [vectorCandidates, fullTextCandidates],
      rankConstant: this.retrievalConfig.rankConstant,
      // Filtered *after* fusion, so a dropped scrap does not silently shorten
      // the answer's evidence: the next real passage takes its place.
      limit: this.retrievalConfig.candidateLimit,
    }).filter(
      (passage) => passage.content.trim().length >= this.retrievalConfig.minPassageCharacters,
    );
    this.logger.debug(
      `Retrieved ${fused.length} passages (vector=${vectorCandidates.length}, lexical=${fullTextCandidates.length})`,
    );
    return fused.slice(0, this.retrievalConfig.maxPassages);
  }
}
