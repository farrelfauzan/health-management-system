import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatExchangeMeta,
  ChatExchangeView,
  ChatMessageListView,
  ChatMessageRecord,
  ChatMessageView,
  ChatSessionListView,
  ChatSessionRecord,
  ChatSessionView,
  CreateChatSessionInput,
  ListChatMessagesQueryInput,
  ListChatSessionsQueryInput,
  SendChatMessageInput,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AiChatbotError } from '../ai-chatbot.error';
import { ChatCompletionMessage } from '../infrastructure/ai-provider.types';
import { AI_CHAT_DISCLAIMER } from './ai-chat-disclaimer';
import { AI_CHAT_SYSTEM_PROMPTS } from './ai-chat-system-prompts';
import { AiProviderResolverService } from './ai-provider-resolver.service';
import { ChatRepository } from '../repository/chat.repository';

/**
 * The most recent turns replayed to the provider. A transcript can be
 * arbitrarily long but a completion request cannot: this caps what the
 * clinic pays per message and keeps the request inside every vendor's
 * context window. Older turns stay in the database for audit.
 */
const REPLAYED_HISTORY_TURN_LIMIT = 20;

/**
 * Orchestrates a chat exchange end to end: ownership check, provider
 * resolution, history replay, the upstream call, and persistence of both
 * turns with their audit trail.
 *
 * Two boundaries are deliberate. The **disclaimer is structural** — every
 * assistant turn persists `disclaimerShown: true` and the text rides in the
 * response envelope's `meta`, never inside the content, so a client cannot
 * render a reply without it and an auditor can prove per message that it was
 * shown. **Nothing here is exposed over HTTP yet**: the chat controller is
 * P13-T08, by which point `P13-T06` context enrichment and `P13-T07` input
 * and output safety guards will have landed — this service is the seam they
 * attach to, and `AI_CHAT_ENABLED` gates the whole path until then.
 */
@Injectable()
export class AiChatbotService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly resolverService: AiProviderResolverService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(
    input: CreateChatSessionInput,
    actor: CurrentUser,
  ): Promise<ChatSessionView> {
    this.assertChatEnabled();
    // Resolving at creation is what stamps the audit columns: the session
    // records which credential set answered it, and P13-T01 made those plain
    // columns precisely so they survive the config being rotated away.
    const { config } = await this.resolverService.resolveActiveProvider();
    const session = await this.chatRepository.createSession({
      ownerUserId: actor.sub,
      channel: input.channel,
      providerKey: config.configId,
      providerKind: config.providerKind,
      title: input.title ?? null,
    });
    return this.toSessionView(session);
  }

  async listOwnSessions(
    query: ListChatSessionsQueryInput,
    actor: CurrentUser,
  ): Promise<ChatSessionListView> {
    const page = await this.chatRepository.listSessionsForOwner({
      ownerUserId: actor.sub,
      channel: query.channel,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((session) => this.toSessionView(session)),
      nextCursor: page.nextCursor,
    };
  }

  /** Admin support view (`chat.session.read:any`) — every owner's sessions. */
  async listAllSessions(query: ListChatSessionsQueryInput): Promise<ChatSessionListView> {
    const page = await this.chatRepository.listAllSessions({
      channel: query.channel,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((session) => this.toSessionView(session)),
      nextCursor: page.nextCursor,
    };
  }

  async getOwnSession(id: string, actor: CurrentUser): Promise<ChatSessionView> {
    return this.toSessionView(await this.requireOwnSession(id, actor));
  }

  async listOwnSessionMessages(
    id: string,
    query: ListChatMessagesQueryInput,
    actor: CurrentUser,
  ): Promise<ChatMessageListView> {
    await this.requireOwnSession(id, actor);
    const page = await this.chatRepository.listMessagesForSession({
      sessionId: id,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((message) => this.toMessageView(message)),
      nextCursor: page.nextCursor,
    };
  }

  async deleteOwnSession(id: string, actor: CurrentUser): Promise<{ id: string }> {
    const wasDeleted = await this.chatRepository.softDeleteSessionForOwner(id, actor.sub);
    if (!wasDeleted) {
      throw new NotFoundException('Chat session not found');
    }
    return { id };
  }

  /**
   * Runs one exchange. The user turn is persisted **before** the upstream
   * call so a provider failure still leaves a record of what was asked —
   * the transcript is a record of the conversation, not only of its
   * successes.
   */
  async sendMessage(
    id: string,
    input: SendChatMessageInput,
    actor: CurrentUser,
  ): Promise<{ data: ChatExchangeView; meta: ChatExchangeMeta }> {
    this.assertChatEnabled();
    const session = await this.requireOwnSession(id, actor);
    const { adapter, config } = await this.resolverService.resolveActiveProvider();
    const exchangeStartedAt = new Date();
    const userMessage = await this.chatRepository.appendMessage({
      sessionId: session.id,
      authorUserId: actor.sub,
      actor: 'USER',
      content: input.content,
      createdAt: exchangeStartedAt,
    });
    const history = await this.chatRepository.listMessagesForSession({
      sessionId: session.id,
      limit: REPLAYED_HISTORY_TURN_LIMIT,
    });
    const result = await adapter.sendChatCompletion(config, {
      sessionExternalId: session.providerSessionId,
      channel: session.channel,
      messages: this.buildCompletionMessages(session, history.items),
      contextPayload: {},
    });
    const assistantMessage = await this.chatRepository.appendMessage({
      sessionId: session.id,
      actor: 'ASSISTANT',
      content: result.content,
      providerKind: result.providerKind,
      providerRequestId: result.providerRequestId === '' ? null : result.providerRequestId,
      providerMessageId: result.providerMessageId,
      providerModel: result.model,
      providerLatencyMs: result.latencyMs,
      // The disclaimer is not optional and not inferred — it is persisted
      // per turn so §3.1 is provable from the transcript alone.
      disclaimerShown: true,
      safetyTags: [],
      // Stamped one millisecond after the user turn: both appends land
      // inside the same millisecond and would otherwise have no defined
      // order, which would let the transcript render the reply first.
      createdAt: new Date(exchangeStartedAt.getTime() + 1),
    });
    return {
      data: {
        userMessage: this.toMessageView(userMessage),
        assistantMessage: this.toMessageView(assistantMessage),
      },
      meta: {
        disclaimer: AI_CHAT_DISCLAIMER,
        providerKind: result.providerKind,
        model: result.model,
        providerRequestId: result.providerRequestId === '' ? null : result.providerRequestId,
      },
    };
  }

  /**
   * Builds the completion request: the channel's system prompt first, then
   * the replayed transcript oldest-first. SYSTEM turns already stored in the
   * transcript are replayed as-is so an auditor's view of what the provider
   * saw matches what was persisted.
   */
  private buildCompletionMessages(
    session: ChatSessionRecord,
    history: ChatMessageRecord[],
  ): ChatCompletionMessage[] {
    return [
      { role: 'system', content: AI_CHAT_SYSTEM_PROMPTS[session.channel] },
      ...history.map((message) => ({
        role: this.toCompletionRole(message.actor),
        content: message.content,
      })),
    ];
  }

  private toCompletionRole(actor: ChatMessageRecord['actor']): ChatCompletionMessage['role'] {
    if (actor === 'ASSISTANT') {
      return 'assistant';
    }
    return actor === 'SYSTEM' ? 'system' : 'user';
  }

  private async requireOwnSession(id: string, actor: CurrentUser): Promise<ChatSessionRecord> {
    const session = await this.chatRepository.findSessionForOwner(id, actor.sub);
    if (session === null) {
      throw new NotFoundException('Chat session not found');
    }
    return session;
  }

  /**
   * The deployment feature flag (§9.2), default off. Reads apply regardless
   * so an existing transcript stays available after a clinic pauses AI —
   * only starting a session and spending tokens are gated.
   */
  private assertChatEnabled(): void {
    if (this.configService.get<string>('AI_CHAT_ENABLED')?.trim().toLowerCase() !== 'true') {
      throw new AiChatbotError('AI_NOT_CONFIGURED', 'AI chat is not enabled on this deployment');
    }
  }

  private toSessionView(session: ChatSessionRecord): ChatSessionView {
    return {
      id: session.id,
      channel: session.channel,
      title: session.title,
      providerKind: session.providerKind,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private toMessageView(message: ChatMessageRecord): ChatMessageView {
    return {
      id: message.id,
      actor: message.actor,
      content: message.content,
      disclaimerShown: message.disclaimerShown,
      safetyTags: message.safetyTags,
      providerRequestId: message.providerRequestId,
      providerModel: message.providerModel,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
