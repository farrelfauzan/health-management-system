import {
  ForbiddenException,
  Injectable,
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
  ChatToolResultView,
  AdminChatSessionListView,
  ChatSessionListView,
  ChatSessionRecord,
  ChatSessionTitleInput,
  ChatSessionView,
  CreateChatSessionInput,
  ListChatMessagesQueryInput,
  ListChatSessionsQueryInput,
  SendChatMessageInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { AiChatbotError } from '../ai-chatbot.error';
import {
  AiChatbotErrorCode,
  ChatCompletionMessage,
  ChatToolCall,
  ResolvedAiProviderConfig,
} from '../infrastructure/ai-provider.types';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { buildChatToolCaller } from '../tools/build-chat-tool-caller';
import { buildChatToolWireDefinitions } from '../tools/build-chat-tool-wire-definitions';
import { ChatToolRegistry } from '../tools/chat-tool.registry';
import { ChatToolCaller } from '../tools/chat-tool.types';
import { isToolDenialCode } from '../tools/is-tool-denial-code';
import { resolveToolCallPatientId } from '../tools/resolve-tool-call-patient-id';
import { resolveToolFailureCode } from '../tools/resolve-tool-failure-code';
import { AI_CHAT_CONTEXT_PREAMBLE } from './ai-chat-context-preamble';
import { AI_CHAT_DISCLAIMERS } from './ai-chat-disclaimer';
import { AI_CHAT_RETRIEVAL_PREAMBLE } from './ai-chat-retrieval-preamble';
import { AI_CHAT_SYSTEM_PROMPTS } from './ai-chat-system-prompts';
import { AiProviderResolverService } from './ai-provider-resolver.service';
import { ChatContextEnrichmentService } from './chat-context-enrichment.service';
import { ChatRetrievalResult, ChatRetrievalService } from './chat-retrieval.service';
import { ChatSessionTitleService } from './chat-session-title.service';
import { normalizeChatSessionTitle } from './normalize-chat-session-title';
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
 * What a denied lookup is filed under in the audit log (SJ-14 §5). Its own
 * resource rather than the domain's (`patient`, `medication`) because the
 * question these rows answer is different: not "who read this chart" — nobody
 * did, the read was refused — but "who asked the assistant for something it
 * would not fetch". `resourceId` carries the tool name, so the indexed
 * `(resource, resourceId)` pair reads as "every refusal of
 * `get_patient_summary`".
 */
const CHAT_TOOL_AUDIT_RESOURCE = 'ChatTool';

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
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly authRepository: AuthRepository,
    private readonly resolverService: AiProviderResolverService,
    private readonly contextEnrichmentService: ChatContextEnrichmentService,
    private readonly chatRetrievalService: ChatRetrievalService,
    private readonly safetyPolicyService: SafetyPolicyService,
    private readonly chatToolRegistry: ChatToolRegistry,
    private readonly chatSessionTitleService: ChatSessionTitleService,
    private readonly auditService: AuditService,
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
    const [history, contextPayload, retrieval] = await Promise.all([
      this.chatRepository.listMessagesForSession({
        sessionId: session.id,
        limit: REPLAYED_HISTORY_TURN_LIMIT,
      }),
      this.contextEnrichmentService.buildContext(session.channel, actor),
      this.chatRetrievalService.retrieve(session.channel, actor, input.content),
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
    const result = await adapter.sendChatCompletion(config, {
      sessionExternalId: session.providerSessionId,
      channel: session.channel,
      messages: this.buildCompletionMessages(session, history.items, contextPayload, retrieval),
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
    // Mode A (ai-chatbot-tools.md §4.4): the lookups the model requested run
    // now, as the asking user, and stop here — nothing is sent back to the
    // provider, so a result can never carry an instruction into the model's
    // context. Each executed call is persisted as its own SYSTEM turn before
    // the response leaves the service.
    const toolResults =
      toolCaller === null || result.toolCalls.length === 0
        ? []
        : await this.executeToolCalls(session, toolCaller, result.toolCalls, exchangeStartedAt);
    // Named from the finished exchange, never from the question alone: the
    // sidebar is supposed to say what a past consultation was about, and the
    // first thing the user typed is already the first bubble of the thread.
    const sessionTitle = await this.nameSessionIfUnnamed(session, adapter, config, {
      channel: session.channel,
      question: input.content,
      answer: outputDecision.content,
    });
    return {
      data: {
        userMessage: this.toMessageView(userMessage),
        assistantMessage: this.toMessageView(assistantMessage),
      },
      meta: {
        disclaimer: AI_CHAT_DISCLAIMERS[session.channel],
        providerKind: result.providerKind,
        model: result.model,
        providerRequestId: result.providerRequestId === '' ? null : result.providerRequestId,
        ...(toolResults.length === 0 ? {} : { toolResults }),
        ...(sessionTitle === null ? {} : { sessionTitle }),
        // Returned even when the reply cites none of them: the client renders
        // what the answer was *allowed* to draw on, and an answer that ignored
        // its sources is a fact worth being able to see.
        ...(retrieval.citations.length === 0 ? {} : { citations: retrieval.citations }),
      },
    };
  }

  /**
   * Gives a nameless session its title, once, and returns it so the exchange
   * that named it can tell the client to refresh its history list. Returns
   * null for a session that already has a title — the first exchange names a
   * conversation and later ones must not rewrite what the user has learned to
   * recognize in the sidebar.
   *
   * A title that loses the race against a concurrent exchange is discarded
   * rather than written: the repository's guarded update is what decides, so
   * the client is never told about a title that is not in the database.
   */
  private async nameSessionIfUnnamed(
    session: ChatSessionRecord,
    adapter: AiChatProvider,
    config: ResolvedAiProviderConfig,
    input: ChatSessionTitleInput,
  ): Promise<string | null> {
    if (session.title !== null) {
      return null;
    }
    const title = await this.chatSessionTitleService.generateTitle(adapter, config, input);
    if (title === null) {
      return null;
    }
    const wasStored = await this.chatRepository.setSessionTitleIfUnset(session.id, title);
    return wasStored ? title : null;
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
   *
   * Swallowing the exception is what makes the audit row load-bearing (SJ-14
   * §5): a refusal that never propagates would otherwise leave no trace
   * outside a transcript nobody queries, so the two denial codes are written
   * to the audit log here, where the decision is still in hand.
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
      const errorCode = resolveToolFailureCode(caughtError);
      if (isToolDenialCode(errorCode)) {
        await this.recordToolDenial(session, caller, toolCall, errorCode);
      }
      return {
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        outcome: 'FAILED',
        result: null,
        errorCode,
      };
    }
  }

  /**
   * Files a refused lookup as a `READ` that did not happen (SJ-14 §5, SJ-4).
   *
   * Best-effort `record` rather than `recordOrThrow`: the disclosure this row
   * describes was already prevented, so failing the exchange over the note
   * about it would cost the user their answer to buy nothing. That is the
   * opposite trade to `AuditInterceptor`, where the data is on its way out
   * the door and the row is the only thing standing behind it.
   *
   * The awaited call is deliberate even so — the denial must be durable before
   * the model is told about it, because the reply is the point at which an
   * attacker learns their probe was noticed.
   */
  private async recordToolDenial(
    session: ChatSessionRecord,
    caller: ChatToolCaller,
    toolCall: ChatToolCall,
    errorCode: AiChatbotErrorCode,
  ): Promise<void> {
    const patientId = resolveToolCallPatientId(toolCall.arguments);
    await this.auditService.record({
      action: 'READ',
      resource: CHAT_TOOL_AUDIT_RESOURCE,
      resourceId: toolCall.name,
      actorUserId: caller.user.sub,
      actorRole: caller.roleCodes.length > 0 ? caller.roleCodes.join(',') : null,
      ...(patientId === null ? {} : { patientId }),
      // The arguments themselves are never copied here: they are model output,
      // unbounded, and on the injection path this log is meant to survive.
      metadata: {
        outcome: 'DENIED',
        errorCode,
        sessionId: session.id,
        channel: session.channel,
      },
    });
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
    // No provider ran, so there is nothing to summarize the exchange with —
    // the user's own words are the title. Worth doing anyway: an escalated
    // first message is exactly the conversation someone comes back looking
    // for, and it must not sit in the history list as "untitled".
    const sessionTitle =
      session.title === null ? await this.nameSessionLocally(session, userMessage.content) : null;
    return {
      data: {
        userMessage: this.toMessageView(userMessage),
        assistantMessage: this.toMessageView(assistantMessage),
      },
      meta: {
        disclaimer: AI_CHAT_DISCLAIMERS[session.channel],
        providerKind: session.providerKind,
        model: '',
        providerRequestId: null,
        ...(sessionTitle === null ? {} : { sessionTitle }),
      },
    };
  }

  /** The provider-free half of {@link nameSessionIfUnnamed}. */
  private async nameSessionLocally(
    session: ChatSessionRecord,
    question: string,
  ): Promise<string | null> {
    const title = normalizeChatSessionTitle(question);
    if (title === null) {
      return null;
    }
    const wasStored = await this.chatRepository.setSessionTitleIfUnset(session.id, title);
    return wasStored ? title : null;
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
      ...(retrieval.promptBlock === ''
        ? []
        : [
            {
              role: 'system' as const,
              content: `${AI_CHAT_RETRIEVAL_PREAMBLE}\n\n${retrieval.promptBlock}`,
            },
          ]),
      ...history
        .filter((message) => message.actor !== 'SYSTEM')
        .map((message) => ({
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
