import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatAvailabilityView,
  ChatExchangeMeta,
  ChatExchangeView,
  ChatMessageListView,
  ChatMessageRecord,
  ChatSafetyTagValue,
  ChatMessageView,
  AdminChatSessionListView,
  ChatSessionListView,
  ChatSessionRecord,
  ChatSessionView,
  CreateChatSessionInput,
  ListChatMessagesQueryInput,
  ListChatSessionsQueryInput,
  SendChatMessageInput,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { AiChatbotError } from '../ai-chatbot.error';
import { ChatCompletionMessage } from '../infrastructure/ai-provider.types';
import { AI_CHAT_CONTEXT_PREAMBLE } from './ai-chat-context-preamble';
import { AI_CHAT_DISCLAIMER } from './ai-chat-disclaimer';
import { AI_CHAT_SYSTEM_PROMPTS } from './ai-chat-system-prompts';
import { AiProviderResolverService } from './ai-provider-resolver.service';
import { ChatContextEnrichmentService } from './chat-context-enrichment.service';
import { SafetyPolicyService } from './safety-policy.service';
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
    private readonly authRepository: AuthRepository,
    private readonly resolverService: AiProviderResolverService,
    private readonly contextEnrichmentService: ChatContextEnrichmentService,
    private readonly safetyPolicyService: SafetyPolicyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Answers "would a message sent right now be answered?" without sending
   * one. The provider is resolved exactly as `sendMessage` would resolve it,
   * so a config that fails validation (missing key, unusable base URL) reads
   * as unavailable here rather than as a working chat that 503s on the first
   * question. Any other failure propagates: an unavailable *database* is not
   * the same claim as a disabled feature.
   */
  async getAvailability(): Promise<ChatAvailabilityView> {
    const isEnabled = this.isChatEnabled();
    if (!isEnabled) {
      return { isAvailable: false, isEnabled: false, hasActiveProvider: false };
    }
    try {
      await this.resolverService.resolveActiveProvider();
      return { isAvailable: true, isEnabled: true, hasActiveProvider: true };
    } catch (caughtError) {
      if (caughtError instanceof AiChatbotError && caughtError.code === 'AI_NOT_CONFIGURED') {
        return { isAvailable: false, isEnabled: true, hasActiveProvider: false };
      }
      throw caughtError;
    }
  }

  async createSession(
    input: CreateChatSessionInput,
    actor: CurrentUser,
  ): Promise<ChatSessionView> {
    this.assertChatEnabled();
    // Resolving at creation is what stamps the audit columns: the session
    // records which credential set answered it, and P13-T01 made those plain
    // columns precisely so they survive the config being rotated away.
    const { config } = await this.resolverService.resolveActiveProvider();
    // The quota is checked and the row written in one transaction, so a
    // concurrent burst cannot open more sessions than the limit allows.
    const session = await this.chatRepository.createSessionWithinQuota(
      {
        ownerUserId: actor.sub,
        channel: input.channel,
        providerKey: config.configId,
        providerKind: config.providerKind,
        title: input.title ?? null,
      },
      this.safetyPolicyService.sessionQuota,
    );
    if (session === null) {
      throw this.safetyPolicyService.buildSessionQuotaError();
    }
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

  /**
   * Admin support view (`chat.session.read:any`) — every owner's sessions.
   * The global guard only proves the actor may read *some* chat session, so
   * the ANY scope is checked here, the way every other module resolves scope
   * in its service. Refusing outright beats silently narrowing the list: an
   * admin screen showing only the operator's own two conversations looks
   * like an empty clinic, not like a missing grant.
   */
  async listAllSessions(
    query: ListChatSessionsQueryInput,
    actor: CurrentUser,
  ): Promise<AdminChatSessionListView> {
    await this.assertAnyScope(actor, 'ChatSession', 'read');
    const page = await this.chatRepository.listAllSessions({
      channel: query.channel,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((session) => ({
        ...this.toSessionView(session),
        ownerUserId: session.ownerUserId,
      })),
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
    // Guards run before the provider is resolved: a blocked prompt must cost
    // neither an upstream call nor the clinic's tokens.
    const inputDecision = this.safetyPolicyService.evaluateInput(input.content);
    const exchangeStartedAt = new Date();
    const userTurn = {
      sessionId: session.id,
      authorUserId: actor.sub,
      actor: 'USER' as const,
      content: input.content,
      safetyTags: inputDecision.safetyTags,
      createdAt: exchangeStartedAt,
    };
    // Quota and write happen in one transaction: counting separately would
    // let a concurrent burst past the limit, which the P13-T11 load test
    // measured at ten-for-one. Emergencies skip the quota entirely — a
    // quota is an anti-abuse measure, and it must never be the reason
    // someone is not shown the ambulance number.
    const userMessage =
      inputDecision.outcome === 'ESCALATE'
        ? await this.chatRepository.appendMessage(userTurn)
        : await this.chatRepository.appendUserMessageWithinQuota(
            userTurn,
            this.safetyPolicyService.messageQuota,
          );
    if (userMessage === null) {
      throw this.safetyPolicyService.buildMessageQuotaError();
    }
    if (inputDecision.outcome === 'ESCALATE') {
      return this.completeWithoutProvider(session, userMessage, inputDecision, exchangeStartedAt);
    }
    const { adapter, config } = await this.resolverService.resolveActiveProvider();
    const [history, contextPayload] = await Promise.all([
      this.chatRepository.listMessagesForSession({
        sessionId: session.id,
        limit: REPLAYED_HISTORY_TURN_LIMIT,
      }),
      this.contextEnrichmentService.buildContext(session.channel, actor),
    ]);
    // The context that is about to reach a third party is persisted as its
    // own SYSTEM turn before the call: the UU PDP audit question is "what
    // personal data went to the processor, and when", and this row is the
    // answer. Empty context writes nothing.
    if (Object.keys(contextPayload).length > 0) {
      await this.chatRepository.appendMessage({
        sessionId: session.id,
        actor: 'SYSTEM',
        content: JSON.stringify(contextPayload),
        createdAt: exchangeStartedAt,
      });
    }
    const result = await adapter.sendChatCompletion(config, {
      sessionExternalId: session.providerSessionId,
      channel: session.channel,
      messages: this.buildCompletionMessages(session, history.items, contextPayload),
      contextPayload,
    });
    // The provider's text is never persisted as it arrived: the output
    // guards run first, and what the patient is shown is what gets stored.
    const outputDecision = this.safetyPolicyService.evaluateOutput(
      result.content,
      session.channel,
    );
    const assistantMessage = await this.chatRepository.appendMessage({
      sessionId: session.id,
      actor: 'ASSISTANT',
      content: outputDecision.content,
      providerKind: result.providerKind,
      providerRequestId: result.providerRequestId === '' ? null : result.providerRequestId,
      providerMessageId: result.providerMessageId,
      providerModel: result.model,
      providerLatencyMs: result.latencyMs,
      // The disclaimer is not optional and not inferred — it is persisted
      // per turn so §3.1 is provable from the transcript alone.
      disclaimerShown: true,
      safetyTags: outputDecision.safetyTags,
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
   * Answers from the deterministic escalation template without touching the
   * provider. The turn is persisted exactly like any other assistant reply —
   * disclaimer flag, safety tags, transcript order — so an emergency looks
   * the same to an auditor as it does to the patient, and the provider audit
   * columns stay null because no provider was involved.
   */
  private async completeWithoutProvider(
    session: ChatSessionRecord,
    userMessage: ChatMessageRecord,
    decision: { safetyTags: ChatSafetyTagValue[]; replyContent: string },
    exchangeStartedAt: Date,
  ): Promise<{ data: ChatExchangeView; meta: ChatExchangeMeta }> {
    const assistantMessage = await this.chatRepository.appendMessage({
      sessionId: session.id,
      actor: 'ASSISTANT',
      content: decision.replyContent,
      disclaimerShown: true,
      safetyTags: decision.safetyTags,
      createdAt: new Date(exchangeStartedAt.getTime() + 1),
    });
    return {
      data: {
        userMessage: this.toMessageView(userMessage),
        assistantMessage: this.toMessageView(assistantMessage),
      },
      meta: {
        disclaimer: AI_CHAT_DISCLAIMER,
        providerKind: session.providerKind,
        model: '',
        providerRequestId: null,
      },
    };
  }

  /**
   * Builds the completion request: the channel's system prompt, then the
   * freshly built context, then the replayed conversation oldest-first.
   *
   * Stored SYSTEM turns are **excluded from the replay** on purpose. They
   * are the audit record of the context sent on earlier exchanges; replaying
   * them would hand the provider several stale snapshots of the patient's
   * appointments alongside the current one, which is both confusing to the
   * model and more personal data than this turn needs.
   */
  private buildCompletionMessages(
    session: ChatSessionRecord,
    history: ChatMessageRecord[],
    contextPayload: Record<string, unknown>,
  ): ChatCompletionMessage[] {
    const hasContext = Object.keys(contextPayload).length > 0;
    return [
      { role: 'system', content: AI_CHAT_SYSTEM_PROMPTS[session.channel] },
      ...(hasContext
        ? [
            {
              role: 'system' as const,
              content: `${AI_CHAT_CONTEXT_PREAMBLE}\n${JSON.stringify(contextPayload)}`,
            },
          ]
        : []),
      ...history
        .filter((message) => message.actor !== 'SYSTEM')
        .map((message) => ({
          role: message.actor === 'ASSISTANT' ? ('assistant' as const) : ('user' as const),
          content: message.content,
        })),
    ];
  }

  private async assertAnyScope(
    actor: CurrentUser,
    resource: string,
    action: string,
  ): Promise<void> {
    const actorRecord = await this.authRepository.findUserById(actor.sub);
    if (!actorRecord) {
      throw new UnauthorizedException('User not found');
    }
    const hasAnyScope = actorRecord.roles
      .flatMap((userRole) => userRole.role.permissions)
      .some(
        (rolePermission) =>
          rolePermission.permission.resource === resource &&
          rolePermission.permission.action === action &&
          rolePermission.permission.scope === 'ANY',
      );
    if (!hasAnyScope) {
      throw new ForbiddenException('You are not allowed to read all chat sessions');
    }
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
    if (!this.isChatEnabled()) {
      throw new AiChatbotError('AI_NOT_CONFIGURED', 'AI chat is not enabled on this deployment');
    }
  }

  private isChatEnabled(): boolean {
    return this.configService.get<string>('AI_CHAT_ENABLED')?.trim().toLowerCase() === 'true';
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
