import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatAvailabilityView,
  ChatChannelValue,
  ChatExchangeMeta,
  ChatExchangeView,
  ChatMessageListView,
  ChatMessageRecord,
  ChatSafetyTagValue,
  ChatMessageView,
  ChatPreferencesRecord,
  ChatPreferencesView,
  ChatToolResultView,
  UpdateChatPreferencesInput,
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
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { AiChatbotError } from '../ai-chatbot.error';
import {
  ChatCompletionMessage,
  ChatToolCall,
  ChatToolWireDefinition,
  ResolvedAiProviderConfig,
  SendChatCompletionResult,
} from '../infrastructure/ai-provider.types';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { buildChatToolCaller } from '../tools/build-chat-tool-caller';
import { buildChatToolWireDefinitions } from '../tools/build-chat-tool-wire-definitions';
import { ChatToolRegistry } from '../tools/chat-tool.registry';
import { ChatToolCaller } from '../tools/chat-tool.types';
import { AI_CHAT_CONTEXT_PREAMBLE } from './ai-chat-context-preamble';
import { AI_CHAT_DISCLAIMER } from './ai-chat-disclaimer';
import { AI_CHAT_RETRIEVAL_PREAMBLE } from './ai-chat-retrieval-preamble';
import { AI_CHAT_SYSTEM_PROMPTS } from './ai-chat-system-prompts';
import { buildChatPreferenceDirectives } from './build-chat-preference-directives';
import { AiProviderResolverService } from './ai-provider-resolver.service';
import { ChatCompactionService } from './chat-compaction.service';
import { ChatContextEnrichmentService } from './chat-context-enrichment.service';
import { ChatRetrievalResult, ChatRetrievalService } from './chat-retrieval.service';
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
 * At most this many lookups execute per user message (ai-chatbot-tools.md
 * §4.4). Not a performance guard: it is what bounds the damage of a prompt
 * injection asking for lookups in bulk, and each executed call also consumes
 * one slot of the hourly message quota, so the loop never exists without the
 * counter.
 */
const MAX_TOOL_CALLS_PER_MESSAGE = 3;

/**
 * The roles that may open a `channel: 'ADMIN'` session (P15-T17). Kept beside
 * the registry's own channel/role map rather than derived from it, because
 * they answer different questions: this one gates *creating* the session, and
 * that one gates *what it may look up*.
 */
const ADMIN_CHANNEL_ROLE_CODES: readonly string[] = ['ADMIN', 'SUPER_ADMIN'];

/**
 * Provider kinds that hide the eventual backend behind a router (§4.6). Mode
 * B is refused for these: the recorded `providerKind` is the router, not
 * whatever answered, so the transfer destination is unknown — tolerable when
 * nothing personal is transmitted, and not tolerable under Pasal 56 when
 * patient fields are.
 */
const ROUTER_PROVIDER_KINDS: readonly string[] = ['OPENAI_COMPATIBLE'];

/**
 * Orchestrates a chat exchange end to end: ownership check, provider
 * resolution, history replay, retrieval, the upstream call, the Mode A tool
 * loop (P15-T04 — the model chooses lookups, HMS executes them as the asking
 * user, and the results go to the client, never back to the provider), and
 * persistence of every turn with its audit trail.
 *
 * Retrieval (P15-T11) sits on the other side of that line from tools on
 * purpose: it is **not** something the model asks for, it runs before the
 * completion like context enrichment. That is what keeps a grounded answer
 * to one round trip, and what lets the retrieved text be persisted before it
 * is transmitted rather than after the model has already seen it.
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
  private readonly logger = new Logger(AiChatbotService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly authRepository: AuthRepository,
    private readonly resolverService: AiProviderResolverService,
    private readonly contextEnrichmentService: ChatContextEnrichmentService,
    private readonly chatRetrievalService: ChatRetrievalService,
    private readonly chatCompactionService: ChatCompactionService,
    private readonly safetyPolicyService: SafetyPolicyService,
    private readonly chatToolRegistry: ChatToolRegistry,
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
    await this.assertChannelAllowed(input.channel, actor);
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

  /**
   * The subject's own view of what HMS remembers about them across sessions
   * (P15-T14). Deliberately the **complete** record — there is no other store
   * of cross-session facts, so a subject asking "what do you remember about
   * me" gets a true and exhaustive answer rather than a curated one.
   */
  async getOwnPreferences(actor: CurrentUser): Promise<ChatPreferencesView> {
    return this.toPreferencesView(await this.chatRepository.findPreferencesForUser(actor.sub));
  }

  /**
   * Written by the subject and **only** by the subject. There is no tool and
   * no code path by which a model's output reaches these columns: the model
   * may suggest a preference in prose, and a human then sets it here. That is
   * the difference between model-*proposed* and model-*written*, and it is
   * what keeps this from becoming a store of things a model decided about
   * someone.
   */
  async updateOwnPreferences(
    input: UpdateChatPreferencesInput,
    actor: CurrentUser,
  ): Promise<ChatPreferencesView> {
    return this.toPreferencesView(
      await this.chatRepository.upsertPreferencesForUser(actor.sub, input),
    );
  }

  /** Erasure by the subject: the row is gone, not flagged. */
  async deleteOwnPreferences(actor: CurrentUser): Promise<ChatPreferencesView> {
    await this.chatRepository.deletePreferencesForUser(actor.sub);
    return this.toPreferencesView(await this.chatRepository.findPreferencesForUser(actor.sub));
  }

  private toPreferencesView(record: ChatPreferencesRecord): ChatPreferencesView {
    return {
      preferredLanguage: record.preferredLanguage,
      responseLength: record.responseLength,
      defaultSpecialtyId: record.defaultSpecialtyId,
      defaultSpecialtyName: record.defaultSpecialtyName,
      updatedAt: record.updatedAt?.toISOString() ?? null,
    };
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
    // The tool caller is built only when something is registered: while the
    // catalogue is empty every exchange skips the actor fetch and the wire
    // request is byte-identical to Phase 13.
    const toolCaller = this.chatToolRegistry.hasRegisteredTools()
      ? await this.buildToolCaller(actor)
      : null;
    const offeredTools =
      toolCaller === null
        ? []
        : this.chatToolRegistry.listOfferedTools(toolCaller, session.channel);
    const toolDefinitions = buildChatToolWireDefinitions(offeredTools);
    // Compaction runs first because its output feeds this very request: a
    // summary written after the reply would leave the turn that needed it
    // unanswered. It is a no-op on all but roughly one message in ten.
    const compactedSession = await this.chatCompactionService.compactIfNeeded(
      session,
      adapter,
      config,
      REPLAYED_HISTORY_TURN_LIMIT,
    );
    const [history, contextPayload, retrieval, preferences] = await Promise.all([
      this.chatRepository.listRecentConversationTurns(session.id, REPLAYED_HISTORY_TURN_LIMIT),
      this.contextEnrichmentService.buildContext(session.channel, actor),
      this.chatRetrievalService.retrieve(session.channel, actor, input.content),
      // P15-T14. Read every exchange rather than cached on the session: a
      // preference changed mid-conversation should take effect on the next
      // message, not the next session.
      this.chatRepository.findPreferencesForUser(actor.sub),
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
    // Retrieved passages are recorded before transmission for the same
    // reason and in its own turn, kept separate from the context payload
    // because they answer a different audit question — this is clinic
    // documents, not personal data, and the readiness review reads the two
    // as different risk classes. Authorless like the context turn, so a
    // grounded answer costs the user no extra quota slot.
    if (retrieval.promptBlock !== '') {
      await this.chatRepository.appendMessage({
        sessionId: session.id,
        actor: 'SYSTEM',
        content: JSON.stringify(retrieval),
        createdAt: exchangeStartedAt,
      });
    }
    const baseMessages = this.buildCompletionMessages(
      compactedSession,
      history,
      contextPayload,
      retrieval,
      preferences,
    );
    const result = await adapter.sendChatCompletion(config, {
      sessionExternalId: session.providerSessionId,
      channel: session.channel,
      messages: baseMessages,
      contextPayload,
      ...(toolDefinitions.length === 0 ? {} : { tools: toolDefinitions }),
    });
    // The provider's text is never persisted as it arrived: the output
    // guards run first, and what the patient is shown is what gets stored.
    const outputDecision = this.safetyPolicyService.evaluateOutput(
      result.content,
      session.channel,
      // §4.7.2: the catalogue and the model's own call count are what let the
      // guard tell "answered from the database" from "answered from training
      // data". Both are known before the lookups run, which is the point —
      // what matters is whether the model asked, not whether it succeeded.
      {
        wasAnyToolOffered: toolDefinitions.length > 0,
        requestedToolCount: result.toolCalls.length,
      },
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
    // The lookups the model requested run now, as the asking user. Each is
    // persisted as its own SYSTEM turn **before** any decision about
    // transmission, which is step 4 of §4.4 and is unconditional in both
    // modes.
    const toolResults =
      toolCaller === null || result.toolCalls.length === 0
        ? []
        : await this.executeToolCalls(session, toolCaller, result.toolCalls, exchangeStartedAt);
    // Mode B (§4.4 step 5, P15-T07): the projected results go back to the
    // provider so it can compose prose over them. Mode A stops above, and a
    // result that never re-enters the model's context cannot carry an
    // instruction into it — which is why Mode A is structurally immune to
    // injection-through-tool-result and this path is not.
    const modeBReply =
      toolResults.length === 0
        ? null
        : await this.composeOverToolResults({
            session,
            adapter,
            config,
            baseMessages,
            assistantContent: outputDecision.content,
            toolCalls: result.toolCalls,
            toolResults,
            toolDefinitions,
          });
    const composedMessage =
      modeBReply === null
        ? null
        : await this.chatRepository.appendMessage({
            sessionId: session.id,
            actor: 'ASSISTANT',
            content: modeBReply.content,
            providerKind: modeBReply.providerKind,
            providerRequestId:
              modeBReply.providerRequestId === '' ? null : modeBReply.providerRequestId,
            providerMessageId: modeBReply.providerMessageId,
            providerModel: modeBReply.model,
            providerLatencyMs: modeBReply.latencyMs,
            disclaimerShown: true,
            safetyTags: modeBReply.safetyTags,
        // After every tool turn, so the transcript reads announce → look up →
        // answer, which is the order the exchange actually happened in.
            createdAt: new Date(
              exchangeStartedAt.getTime() + 2 + MAX_TOOL_CALLS_PER_MESSAGE + 1,
            ),
          });
    return {
      data: {
        userMessage: this.toMessageView(userMessage),
        // In Mode B the composed reply is the answer; the announcement turn
        // above stays in the transcript because it is what the model actually
        // said first, and an auditor reading the session sees both.
        assistantMessage: this.toMessageView(composedMessage ?? assistantMessage),
      },
      meta: {
        disclaimer: AI_CHAT_DISCLAIMER,
        providerKind: result.providerKind,
        model: result.model,
        providerRequestId: result.providerRequestId === '' ? null : result.providerRequestId,
        ...(toolResults.length === 0 ? {} : { toolResults }),
        // Returned even when the reply cites none of them: the client renders
        // what the answer was *allowed* to draw on, and an answer that ignored
        // its sources is a fact worth being able to see.
        ...(retrieval.citations.length === 0 ? {} : { citations: retrieval.citations }),
      },
    };
  }

  /**
   * Executes at most {@link MAX_TOOL_CALLS_PER_MESSAGE} of the model's
   * requested calls, in order, dropping the excess. Every executed call —
   * including a refused or failed one — persists a SYSTEM turn carrying what
   * was asked and what came back, stamped after the assistant turn so the
   * transcript reads announcement-then-lookup. The turn carries the asking
   * user's id on purpose: that is what makes it count against the hourly
   * message quota.
   */
  private async executeToolCalls(
    session: ChatSessionRecord,
    caller: ChatToolCaller,
    toolCalls: ReadonlyArray<ChatToolCall>,
    exchangeStartedAt: Date,
  ): Promise<ChatToolResultView[]> {
    const executableCalls = toolCalls.slice(0, MAX_TOOL_CALLS_PER_MESSAGE);
    const toolResults: ChatToolResultView[] = [];
    for (const [index, toolCall] of executableCalls.entries()) {
      const toolResult = await this.executeSingleToolCall(session, caller, toolCall);
      await this.chatRepository.appendMessage({
        sessionId: session.id,
        authorUserId: caller.user.sub,
        actor: 'SYSTEM',
        content: JSON.stringify(toolResult),
        createdAt: new Date(exchangeStartedAt.getTime() + 2 + index),
      });
      toolResults.push(toolResult);
    }
    return toolResults;
  }

  /**
   * One dispatch, converted to a view instead of a thrown error: a failed
   * lookup is part of the exchange's answer (§4.5 — it renders as failed,
   * never as prose about what might have been there), and one bad call must
   * not discard the assistant turn or the other results.
   */
  private async executeSingleToolCall(
    session: ChatSessionRecord,
    caller: ChatToolCaller,
    toolCall: ChatToolCall,
  ): Promise<ChatToolResultView> {
    try {
      const outcome = await this.chatToolRegistry.dispatchTool({
        caller,
        channel: session.channel,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
      });
      return {
        toolName: outcome.toolName,
        arguments: outcome.validatedArguments,
        outcome: 'SUCCESS',
        result: outcome.result,
        errorCode: null,
      };
    } catch (caughtError) {
      return {
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        outcome: 'FAILED',
        result: null,
        errorCode:
          caughtError instanceof AiChatbotError ? caughtError.code : 'AI_TOOL_EXECUTION_FAILED',
      };
    }
  }

  /**
   * Mode B's second round trip (§4.4 step 5), or null when Mode B is off or
   * refused.
   *
   * **Three refusals, all before any patient field reaches the wire.**
   * `AI_CHAT_TOOL_RESULT_TO_PROVIDER` must be on; the active provider must
   * not be a router kind (§4.6 — behind `OPENAI_COMPATIBLE` the recorded
   * `providerKind` is the router rather than whatever answered, so the
   * transfer destination is unknown, which is tolerable when nothing personal
   * is transmitted and not tolerable under Pasal 56 when it is); and at least
   * one lookup must have succeeded, since replaying only failures asks the
   * model to narrate errors.
   *
   * **The replay carries projected results and nothing else.** Each `tool`
   * turn holds the same allowlisted object the client received — never the
   * domain service's response — so the §4.3 allowlist is the last thing
   * standing between a domain service and a foreign processor, which is
   * exactly the weight §4.3 says it carries in this mode.
   *
   * **The catalogue is deliberately not re-sent.** The cap is three lookups
   * per user message and they have already run; re-offering the tools would
   * invite a second round of calls this loop has no budget to execute, and
   * "answer from what was gathered" is what §4.4 step 6 asks for.
   *
   * A failure here degrades to Mode A rather than failing the exchange: the
   * announcement turn and the rendered results are already persisted and
   * already a usable answer.
   */
  private async composeOverToolResults(params: {
    session: ChatSessionRecord;
    adapter: AiChatProvider;
    config: ResolvedAiProviderConfig;
    baseMessages: ChatCompletionMessage[];
    assistantContent: string;
    toolCalls: ReadonlyArray<ChatToolCall>;
    toolResults: ChatToolResultView[];
    toolDefinitions: ReadonlyArray<ChatToolWireDefinition>;
  }): Promise<(SendChatCompletionResult & { safetyTags: ChatSafetyTagValue[] }) | null> {
    if (!this.isToolResultToProviderEnabled()) {
      return null;
    }
    if (ROUTER_PROVIDER_KINDS.includes(params.config.providerKind)) {
      this.logger.warn(
        buildSafeErrorLog('chat_mode_b_refused_router_kind', {
          providerKind: params.config.providerKind,
        }),
      );
      return null;
    }
    const executedCalls = params.toolCalls.slice(0, MAX_TOOL_CALLS_PER_MESSAGE);
    const successfulResults = params.toolResults.filter((result) => result.outcome === 'SUCCESS');
    if (successfulResults.length === 0) {
      return null;
    }
    try {
      const replayMessages: ChatCompletionMessage[] = [
        ...params.baseMessages,
        {
          role: 'assistant',
          content: params.assistantContent,
          toolCalls: executedCalls,
        },
        ...params.toolResults.map((result, index) => ({
          role: 'tool' as const,
          // The projected result, which is what the client got — never the
          // domain service's own response.
          content: JSON.stringify(result.result ?? { error: result.errorCode }),
          toolCallId: executedCalls[index]?.id ?? '',
          toolName: result.toolName,
        })),
      ];
      const composed = await params.adapter.sendChatCompletion(params.config, {
        sessionExternalId: params.session.providerSessionId,
        channel: params.session.channel,
        messages: replayMessages,
        contextPayload: {},
      });
      // The composed prose runs the output guards exactly like the first
      // reply. The sourcing argument says a lookup did happen, so the §4.7.2
      // guard stays silent — this text is grounded by construction.
      const decision = this.safetyPolicyService.evaluateOutput(
        composed.content,
        params.session.channel,
        { wasAnyToolOffered: params.toolDefinitions.length > 0, requestedToolCount: 1 },
      );
      return { ...composed, content: decision.content, safetyTags: decision.safetyTags };
    } catch (caughtError) {
      this.logger.warn(
        buildSafeErrorLog('chat_mode_b_compose_failed', {
          sessionId: params.session.id,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return null;
    }
  }

  /**
   * `AI_CHAT_TOOL_RESULT_TO_PROVIDER` (§7.4), default off, and **it must not
   * be enabled in any environment until §7.4's four conditions are met** —
   * an explicit-consent model, a `transferBasis` column on the provider
   * config, a DPIA, and a signed DPA. The code merges before they do so that
   * enabling is a flag flip rather than a re-implementation.
   */
  private isToolResultToProviderEnabled(): boolean {
    return (
      this.configService
        .get<string>('AI_CHAT_TOOL_RESULT_TO_PROVIDER')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  private async buildToolCaller(actor: CurrentUser): Promise<ChatToolCaller> {
    const actorRecord = await this.authRepository.findUserById(actor.sub);
    if (!actorRecord) {
      throw new UnauthorizedException('User not found');
    }
    return buildChatToolCaller(actor, actorRecord);
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
   * Builds the completion request: the channel's system prompt, the freshly
   * built context, the retrieved passages, then the replayed conversation
   * oldest-first.
   *
   * Stored SYSTEM turns are **excluded from the replay** on purpose. They
   * are the audit record of the context and passages sent on earlier
   * exchanges; replaying them would hand the provider several stale snapshots
   * of the patient's appointments alongside the current one, and every
   * document the conversation has ever touched — both confusing to the model
   * and more data than this turn needs.
   *
   * Retrieval comes **after** context and **before** the conversation: the
   * passages are the more voluminous of the two system payloads, and putting
   * them next to the user's question is what keeps the model reading them as
   * material for *this* question rather than as standing background.
   */
  private buildCompletionMessages(
    session: ChatSessionRecord,
    history: ChatMessageRecord[],
    contextPayload: Record<string, unknown>,
    retrieval: ChatRetrievalResult,
    preferences: ChatPreferencesRecord,
  ): ChatCompletionMessage[] {
    const hasContext = Object.keys(contextPayload).length > 0;
    const compactionSummary = this.chatCompactionService.buildReplaySummary(session);
    const preferenceDirectives = buildChatPreferenceDirectives(preferences);
    return [
      { role: 'system', content: AI_CHAT_SYSTEM_PROMPTS[session.channel] },
      // Straight after the channel prompt, because these modify how it is
      // followed. Never later than the conversation: a preference is a
      // standing setting, not a fact about this turn.
      ...(preferenceDirectives === null
        ? []
        : [{ role: 'system' as const, content: preferenceDirectives }]),
      // Before context and passages: it is the oldest material in the
      // request and belongs where the conversation it summarises would have
      // been, so the model reads the whole thing in chronological order.
      ...(compactionSummary === null
        ? []
        : [{ role: 'system' as const, content: compactionSummary }]),
      ...(hasContext
        ? [
            {
              role: 'system' as const,
              content: `${AI_CHAT_CONTEXT_PREAMBLE}\n${JSON.stringify(contextPayload)}`,
            },
          ]
        : []),
      ...(retrieval.promptBlock === ''
        ? []
        : [
            {
              role: 'system' as const,
              content: `${AI_CHAT_RETRIEVAL_PREAMBLE}\n\n${retrieval.promptBlock}`,
            },
          ]),
      // No SYSTEM filter here: `listRecentConversationTurns` excludes them at
      // the query, so they never count against the replay window either.
      ...history.map((message) => ({
        role: message.actor === 'ASSISTANT' ? ('assistant' as const) : ('user' as const),
        content: message.content,
      })),
    ];
  }

  /**
   * P15-T17. The admin channel is bound to the admin roles at session
   * creation, not at message time: the channel decides the system prompt, the
   * context policy and the tool catalogue, so a session opened in the wrong
   * channel is a mis-shaped conversation from its first turn, and refusing it
   * once beats filtering its consequences on every message.
   *
   * The other two channels are deliberately unbound. `chat.session.create:own`
   * is what opens them, and a doctor with a personal patient record has a
   * legitimate reason to open a patient session about their own care —
   * restricting that would be a policy nobody asked for.
   *
   * Note this is **not** the tool gate. `ChatToolRegistry` re-derives the
   * channel/role agreement for every offer and every dispatch (§4.1.1 rule 1),
   * so an admin who somehow held a doctor-channel session would still be
   * offered nothing. This check is what stops that session existing.
   */
  private async assertChannelAllowed(
    channel: ChatChannelValue,
    actor: CurrentUser,
  ): Promise<void> {
    if (channel !== 'ADMIN') {
      return;
    }
    const actorRecord = await this.authRepository.findUserById(actor.sub);
    if (!actorRecord) {
      throw new UnauthorizedException('User not found');
    }
    const hasAdminRole = actorRecord.roles.some((userRole) =>
      ADMIN_CHANNEL_ROLE_CODES.includes(userRole.role.code),
    );
    if (!hasAdminRole) {
      throw new ForbiddenException('You are not allowed to open an admin chat session');
    }
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
