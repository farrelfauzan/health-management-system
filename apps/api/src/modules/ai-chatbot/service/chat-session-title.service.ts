import { Injectable, Logger } from '@nestjs/common';

import { ChatSessionTitleInput } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ResolvedAiProviderConfig } from '../infrastructure/ai-provider.types';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { AI_CHAT_TITLE_PROMPT } from './ai-chat-title-prompt';
import { normalizeChatSessionTitle } from './normalize-chat-session-title';

/**
 * How much of each turn the title call sees. A title needs the topic, not the
 * transcript: the opening sentences carry it, and sending less keeps this
 * call cheap enough to run once per session without anyone noticing it on the
 * clinic's bill.
 */
const TITLE_EXCERPT_MAX_LENGTH = 400;

/**
 * Names a conversation after what it is about (P15 follow-up).
 *
 * Sessions used to be titled with the raw first message, so the history list
 * was a column of truncated questions — the same text the first bubble of the
 * thread already showed, which told a returning user nothing they could not
 * see by opening it. A title is supposed to be the *topic*, so it is written
 * from the completed exchange by the same provider that answered it.
 *
 * **This never fails an exchange.** The reply has already been persisted and
 * returned by the time a title is wanted; an unreachable provider, a timeout,
 * or an empty summary degrades to a title derived from the user's own
 * question, which is strictly what the old behaviour was. A conversation is
 * never left nameless because the naming call went wrong.
 *
 * No new personal data reaches the provider here: the excerpts are text this
 * same provider produced or was sent moments earlier in the same exchange,
 * which is why this call persists no SYSTEM audit turn of its own — the
 * exchange's turns already record what was transmitted.
 */
@Injectable()
export class ChatSessionTitleService {
  private readonly logger = new Logger(ChatSessionTitleService.name);

  /**
   * Returns the title to store, or null when neither the model nor the
   * question yields anything usable (a question of pure punctuation, say).
   */
  async generateTitle(
    adapter: AiChatProvider,
    config: ResolvedAiProviderConfig,
    input: ChatSessionTitleInput,
  ): Promise<string | null> {
    const fallbackTitle = normalizeChatSessionTitle(input.question);
    try {
      const result = await adapter.sendChatCompletion(config, {
        sessionExternalId: null,
        channel: input.channel,
        messages: [
          { role: 'system', content: AI_CHAT_TITLE_PROMPT },
          { role: 'user', content: this.buildTitleRequest(input) },
        ],
        contextPayload: {},
      });
      return normalizeChatSessionTitle(result.content) ?? fallbackTitle;
    } catch (caughtError) {
      // The reason only: the failure can quote the exchange that produced it,
      // and the exchange is the user's.
      this.logger.warn(
        buildSafeErrorLog('chat_session_title_skipped', {
          channel: input.channel,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return fallbackTitle;
    }
  }

  private buildTitleRequest(input: ChatSessionTitleInput): string {
    return [
      `Question: ${this.toExcerpt(input.question)}`,
      `Answer: ${this.toExcerpt(input.answer)}`,
    ].join('\n');
  }

  private toExcerpt(value: string): string {
    const collapsed = value.trim().replace(/\s+/g, ' ');
    return collapsed.length <= TITLE_EXCERPT_MAX_LENGTH
      ? collapsed
      : collapsed.slice(0, TITLE_EXCERPT_MAX_LENGTH);
  }
}
