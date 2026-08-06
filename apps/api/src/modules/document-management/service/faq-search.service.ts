import { Injectable, Logger } from '@nestjs/common';

import { FaqSearchPassage } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { DocumentRetrievalService } from './document-retrieval.service';

/**
 * `search_faq` — the only way the public WhatsApp/Telegram channel reads the
 * corpus (`PCS-T04`; customer-service strategy §4.2).
 *
 * `DocumentRetrievalService` already refuses to widen the corpus: its SQL
 * predicate admits clinic documents at `FAQ_KNOWLEDGE_BASE` filtered by the
 * asking channel's visibility, plus the asking user's own knowledge base, and
 * nothing else. What it cannot refuse is its own *arguments*. `channelVisibility`
 * and `ownerUserId` are parameters, so a caller on an anonymous channel can
 * ask for `DOCTOR` and be handed staff-only SOPs, or pass a user id and be
 * handed that user's private documents — both entirely within the type.
 *
 * That is fine for the in-app assistant, which knows who is asking. It is not
 * fine here. The strategy's first principle is that this channel is
 * unauthenticated: a WhatsApp number identifies a conversation, not a person,
 * so there is no user whose personal corpus could legitimately be read, and no
 * caller entitled to the staff-facing half. **This service exists to remove
 * both parameters** — the method takes a question and nothing else, and the
 * two values that decide scope are constants in this file rather than
 * arguments a future tool-registry change could set wrongly.
 *
 * The same reasoning covers the return type: {@link FaqSearchPassage} is the
 * §4.2 output allowlist, and projecting to it here means a retrieved chunk's
 * internal ids and its RRF score cannot reach a reply by omission.
 *
 * **A retrieval failure returns no passages rather than throwing.** An
 * unreachable embedder or a slow query must degrade to "I don't have that
 * written down" — the strategy's escalation path — and not to an error on a
 * customer's WhatsApp message. This mirrors `ChatRetrievalService`'s
 * non-fatal behaviour for the same reason.
 */
@Injectable()
export class FaqSearchService {
  private readonly logger = new Logger(FaqSearchService.name);

  /**
   * The channel is anonymous, so only documents an admin marked reachable by
   * patients are candidates. `BOTH` is admitted alongside it by the predicate;
   * `DOCTOR`-only documents are not candidates at all rather than outranked.
   */
  private static readonly CHANNEL_VISIBILITY = 'PATIENT' as const;

  /**
   * No personal knowledge base is ever in scope. A customer on WhatsApp has no
   * HMS account, and even if a future flow links one, a personal corpus is
   * private to its owner's own sessions — never to a channel that answers
   * whoever holds the phone.
   */
  private static readonly OWNER_USER_ID = null;

  constructor(private readonly documentRetrievalService: DocumentRetrievalService) {}

  /**
   * Answers one customer question from the clinic corpus.
   *
   * Returns an empty array both when nothing matched and when retrieval
   * failed. The caller cannot distinguish them, and deliberately should not:
   * the reply is the same in either case, and a tool that reported "the
   * embedder is down" would put infrastructure state into a customer
   * conversation.
   */
  async searchFaq(query: string): Promise<FaqSearchPassage[]> {
    try {
      const passages = await this.documentRetrievalService.retrievePassages({
        query,
        channelVisibility: FaqSearchService.CHANNEL_VISIBILITY,
        ownerUserId: FaqSearchService.OWNER_USER_ID,
      });
      return passages.map((passage) => ({
        documentTitle: passage.documentTitle,
        content: passage.content,
      }));
    } catch (caughtError) {
      // The reason goes to the log with no payload. A retrieval error can
      // quote the question that produced it, and on this channel the question
      // is a member of the public's.
      this.logger.warn(
        buildSafeErrorLog('faq_search_failed', {
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return [];
    }
  }
}
