import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatCompactionResult, ChatMessageRecord, ChatSessionRecord } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { ResolvedAiProviderConfig } from '../infrastructure/ai-provider.types';
import { ChatRepository } from '../repository/chat.repository';
import {
  AI_CHAT_COMPACTION_INSTRUCTION,
  AI_CHAT_COMPACTION_PREAMBLE,
} from './ai-chat-compaction-prompts';

/**
 * How many dropped turns accumulate before a compaction pass runs. Not one:
 * compacting on every message past the window would spend a provider call per
 * exchange for a summary that barely changed. Batching means the cost is
 * amortised to roughly one extra call per this many turns.
 */
const COMPACTION_BATCH_TURNS = 10;

/**
 * The most turns one pass will read. A session that somehow accumulated a
 * huge un-summarised backlog — compaction disabled for a week, then enabled —
 * must not send its entire history upstream in one request.
 */
const MAX_TURNS_PER_PASS = 40;

/** Characters. A summary longer than this is not a summary. */
const MAX_SUMMARY_CHARACTERS = 2_000;

/**
 * Conversation compaction (ai-chatbot-tools.md §6.2).
 *
 * Past the replay window older exchanges vanish and the assistant starts
 * contradicting things it said earlier in the same conversation. This keeps a
 * rolling summary of the dropped turns on the session and replays it as one
 * `SYSTEM` message.
 *
 * **The summary is folded, not rewritten from scratch.** Each pass summarises
 * the previous summary together with the next batch of dropped turns, so the
 * cost per pass is bounded by the batch rather than growing with the
 * conversation — and a session cannot reach a state where compacting it means
 * uploading its entire history.
 *
 * **It adds a provider round trip, and only sometimes.** A pass runs when at
 * least {@link COMPACTION_BATCH_TURNS} turns have dropped out un-summarised,
 * so roughly one message in ten pays for it and the rest pay nothing. The
 * call is deliberately **not** counted against the user's hourly quota: it is
 * system-initiated housekeeping, not a message the user sent, and the quota
 * exists to bound what a user can drive rather than what HMS chooses to do.
 *
 * Failure is non-fatal in both directions: a failed pass leaves the previous
 * summary in place and the exchange proceeds, because a conversation without
 * a summary is Phase 13 behaviour rather than a broken one.
 */
@Injectable()
export class ChatCompactionService {
  private readonly logger = new Logger(ChatCompactionService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The stored summary rendered for the completion request, or null when
   * there is nothing to carry forward.
   */
  buildReplaySummary(session: ChatSessionRecord): string | null {
    if (!this.isCompactionEnabled() || session.compactedSummary === null) {
      return null;
    }
    const summary = session.compactedSummary.trim();
    return summary === '' ? null : `${AI_CHAT_COMPACTION_PREAMBLE}\n${summary}`;
  }

  /**
   * Runs a pass if enough turns have dropped out un-summarised, and returns
   * the session to use for this exchange — the updated one when a pass ran,
   * the original otherwise, so the caller never has to re-read it.
   */
  async compactIfNeeded(
    session: ChatSessionRecord,
    adapter: AiChatProvider,
    config: ResolvedAiProviderConfig,
    replayWindowTurns: number,
  ): Promise<ChatSessionRecord> {
    if (!this.isCompactionEnabled()) {
      return session;
    }
    try {
      const totalTurns = await this.chatRepository.countConversationTurns(session.id);
      // Turns that have fallen out of the window and are not yet covered.
      const droppedTurns = totalTurns - replayWindowTurns - session.compactedTurnCount;
      if (droppedTurns < COMPACTION_BATCH_TURNS) {
        return session;
      }
      const turns = await this.chatRepository.listConversationTurnRange(
        session.id,
        session.compactedTurnCount,
        Math.min(droppedTurns, MAX_TURNS_PER_PASS),
      );
      if (turns.length === 0) {
        return session;
      }
      const summary = await this.summarise(session, turns, adapter, config);
      if (summary === '') {
        return session;
      }
      return await this.chatRepository.updateSessionCompaction(session.id, {
        compactedSummary: summary,
        compactedTurnCount: session.compactedTurnCount + turns.length,
      } satisfies ChatCompactionResult);
    } catch (caughtError) {
      // The previous summary stays; the exchange proceeds without a fresher
      // one. The log names no content — the input here is the conversation.
      this.logger.warn(
        buildSafeErrorLog('chat_compaction_skipped', {
          sessionId: session.id,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return session;
    }
  }

  /**
   * One summarisation call. The previous summary rides in as the first user
   * turn so the model folds rather than replaces it, and the whole thing goes
   * up as a single-turn request — no channel prompt, no tools, no context:
   * this is a text transformation over rows HMS already holds, not a
   * conversation.
   */
  private async summarise(
    session: ChatSessionRecord,
    turns: readonly ChatMessageRecord[],
    adapter: AiChatProvider,
    config: ResolvedAiProviderConfig,
  ): Promise<string> {
    const transcript = turns
      .map((turn) => `${turn.actor === 'ASSISTANT' ? 'Assistant' : 'User'}: ${turn.content}`)
      .join('\n');
    const previousSummary =
      session.compactedSummary === null
        ? ''
        : `Summary so far:\n${session.compactedSummary}\n\n`;
    const result = await adapter.sendChatCompletion(config, {
      sessionExternalId: null,
      channel: session.channel,
      messages: [
        { role: 'system', content: AI_CHAT_COMPACTION_INSTRUCTION },
        { role: 'user', content: `${previousSummary}Earlier messages:\n${transcript}` },
      ],
      contextPayload: {},
    });
    return result.content.trim().slice(0, MAX_SUMMARY_CHARACTERS);
  }

  /**
   * `AI_CHAT_COMPACTION_ENABLED`, default off. With it off no summary is
   * written, none is replayed, and no extra provider call is ever made —
   * Phase 13's behaviour, including its silent forgetting.
   */
  private isCompactionEnabled(): boolean {
    return (
      this.configService.get<string>('AI_CHAT_COMPACTION_ENABLED')?.trim().toLowerCase() === 'true'
    );
  }
}
