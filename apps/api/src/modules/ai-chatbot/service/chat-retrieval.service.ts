import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatCitationView,
  ChatChannelValue,
  DocumentVisibilityValue,
  RetrievedDocumentChunk,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { DocumentRetrievalService } from '../../document-management/service/document-retrieval.service';

/**
 * What one retrieval contributed to an exchange. `promptBlock` is empty
 * exactly when `citations` is empty — a caller checks one and gets both.
 */
export type ChatRetrievalResult = {
  /**
   * The numbered passages, rendered exactly as they are appended to the
   * retrieval SYSTEM message. Persisting this string rather than a
   * reconstruction of it is what makes the transcript the record of what
   * reached the provider, not an approximation of it.
   */
  promptBlock: string;
  citations: ChatCitationView[];
};

const EMPTY_RESULT: ChatRetrievalResult = { promptBlock: '', citations: [] };

/**
 * Per channel, the clinic-corpus visibility a session may read. A staff-only
 * SOP carries `DOCTOR` and is therefore unreachable from a patient session by
 * the repository query, not by ranking (ai-chatbot-tools.md §5.5).
 */
const CHANNEL_VISIBILITY: Readonly<
  Record<ChatChannelValue, Exclude<DocumentVisibilityValue, 'BOTH'>>
> = {
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
};

/**
 * The channels whose users have a personal knowledge base to retrieve from.
 * Patients do not have one in this phase — `PATIENT`-owned document rows
 * exist for the future patient-document feature, not for retrieval — so the
 * patient channel passes no owner and the personal half of the union
 * contributes nothing at all.
 */
const CHANNELS_WITH_PERSONAL_CORPUS: ReadonlySet<ChatChannelValue> = new Set(['DOCTOR']);

/**
 * The chatbot's half of `P15-T11`: decides **whether** an exchange retrieves,
 * and turns what came back into the two things the exchange needs — the text
 * that goes to the provider and the citations that come back to the client.
 *
 * The mechanics live in `DocumentRetrievalService`, deliberately: the corpus
 * belongs to the document store, and the WA/Telegram channel will retrieve
 * from it without going through this service at all.
 *
 * **A retrieval failure is never the reason a question goes unanswered**
 * (§5.5). An unreachable embedder, a query that times out, a corpus that has
 * not been ingested yet — each degrades to an ungrounded answer, which is
 * exactly the Phase 13 behaviour, rather than a 502 on a question the model
 * could have answered from the conversation.
 */
@Injectable()
export class ChatRetrievalService {
  private readonly logger = new Logger(ChatRetrievalService.name);

  constructor(
    private readonly documentRetrievalService: DocumentRetrievalService,
    private readonly configService: ConfigService,
  ) {}

  async retrieve(
    channel: ChatChannelValue,
    actor: CurrentUser,
    question: string,
  ): Promise<ChatRetrievalResult> {
    if (!this.isRetrievalEnabled()) {
      return EMPTY_RESULT;
    }
    try {
      const passages = await this.documentRetrievalService.retrievePassages({
        query: question,
        channelVisibility: CHANNEL_VISIBILITY[channel],
        ownerUserId: CHANNELS_WITH_PERSONAL_CORPUS.has(channel) ? actor.sub : null,
      });
      return passages.length === 0 ? EMPTY_RESULT : this.toResult(passages);
    } catch (caughtError) {
      // The reason goes to the log with no payload: a retrieval error can
      // quote the question that produced it, and the question is the user's.
      this.logger.warn(
        buildSafeErrorLog('chat_retrieval_skipped', {
          channel,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return EMPTY_RESULT;
    }
  }

  /**
   * Numbers the passages once, and uses that number in both directions: the
   * model is told to cite `[n]`, and the client is handed the document `[n]`
   * refers to. Citations are built from the database rows rather than parsed
   * out of the reply, so a marker the model invented resolves to nothing
   * instead of to a plausible-looking document.
   */
  private toResult(passages: readonly RetrievedDocumentChunk[]): ChatRetrievalResult {
    const citations = passages.map((passage, index) => ({
      reference: index + 1,
      documentId: passage.documentId,
      title: passage.documentTitle,
      language: passage.language,
      sourceTier: passage.sourceTier,
    }));
    const promptBlock = passages
      .map((passage, index) => {
        const citation = citations[index];
        return [
          `[${citation?.reference}] ${passage.documentTitle} (${passage.language})`,
          passage.content.trim(),
        ].join('\n');
      })
      .join('\n\n');
    return { promptBlock, citations };
  }

  /**
   * `AI_CHAT_RETRIEVAL_ENABLED`, default off. With it off no corpus is
   * queried, no SYSTEM turn is written, and the completion request carries
   * neither the preamble nor a passage — the Phase 13 body exactly.
   */
  private isRetrievalEnabled(): boolean {
    return (
      this.configService.get<string>('AI_CHAT_RETRIEVAL_ENABLED')?.trim().toLowerCase() === 'true'
    );
  }
}
