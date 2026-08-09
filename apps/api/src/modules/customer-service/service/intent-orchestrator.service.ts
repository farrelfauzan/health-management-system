import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConversationTurn, CustomerServiceConfig } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import {
  ChatCompletionMessage,
  ChatToolCall,
} from '../../ai-chatbot/infrastructure/ai-provider.types';
import { AiProviderResolverService } from '../../ai-chatbot/service/ai-provider-resolver.service';
import { CustomerServiceError } from '../customer-service.error';
import { resolveCustomerServiceConfig } from '../customer-service.config';
import { buildCsToolWireDefinitions } from '../tools/build-cs-tool-wire-definitions';
import { CsToolRegistry } from '../tools/cs-tool.registry';
import { CsToolContext } from '../tools/cs-tool.types';
import { buildCsSystemPrompt } from './build-cs-system-prompt';

/** §6's bound: at most three tool calls answer one inbound message. */
const MAX_TOOL_CALLS_PER_MESSAGE = 3;

/**
 * How many times the provider may be asked in one turn.
 *
 * Three, not unbounded: the loop's exit condition is the model deciding to
 * stop calling tools, and a model that never decides that would otherwise hold
 * a WhatsApp customer waiting while it burned the clinic's token budget. The
 * last round is answered with the tools still offered but the results already
 * in hand, so a model that keeps asking simply runs out of rounds and the
 * customer gets whatever it said last.
 */
const MAX_PROVIDER_ROUNDS = 3;

/** One dispatched call, with everything the loop and the transcript need. */
type ExecutedCsToolCall = {
  record: CsToolInvocationRecord;
  replayTurn: ChatCompletionMessage;
  deterministicReply?: string;
  pausesConversation?: boolean;
  requestContact?: boolean;
};

/** One executed lookup, as the transcript records it. */
export type CsToolInvocationRecord = {
  toolName: string;
  arguments: unknown;
  outcome: 'SUCCESS' | 'FAILED';
  errorCode: string | null;
  /**
   * How many items the lookup returned, or null when the result is not a list
   * (`PCS-T11`).
   *
   * A **count, not a payload**, and the distinction is what makes this
   * compatible with `PCS-T07`'s decision to keep results out of the
   * transcript. That decision was about not putting a second copy of every FAQ
   * passage into a retained record — a number is neither a passage nor a
   * patient, and without it §8.4's FAQ no-hit rate cannot be computed at all:
   * "the corpus could not answer this" and "the corpus was never asked" look
   * identical from a bare tool name.
   */
  resultCount: number | null;
};

/**
 * What one orchestration produced.
 *
 * `replyContent === null` means the provider could not be reached or answered
 * with nothing, and the caller sends a template rather than silence.
 * `isDeterministic` marks a reply this codebase wrote rather than the model —
 * the caller persists it under the `SYSTEM` role, because "the clinic decided
 * to say this" and "the model composed this" are different facts for an
 * auditor.
 */
export type IntentOrchestrationResult = {
  replyContent: string | null;
  isDeterministic: boolean;
  /** The reply asks for a contact card (§5.1.1 tier 2). */
  requestContact: boolean;
  /** A tool's own effect moved the conversation out of `BOT_ACTIVE`. */
  pausesConversation: boolean;
  toolInvocations: CsToolInvocationRecord[];
};

/**
 * Turns a customer's message into a reply, using the clinic's configured
 * provider and the channel's three tools (§6).
 *
 * **There is no separate intent classifier** (D-CS-07). §6 settles this: the
 * tool loop *is* the classification — the model's choice of tool is the intent
 * decision, and "no tool plus a plain answer" covers greetings, thanks, and
 * out-of-scope topics. A classifier stage would double the latency of a
 * channel where people expect a reply in seconds, to produce a label the next
 * call derives anyway.
 *
 * **Tool results go back to the model** (D-CS-02), unlike the in-app
 * assistant's Mode A. That is safe here and not there for one reason: the CS
 * tools' outputs are non-sensitive *by construction* — FAQ passages are clinic
 * documents, session availability is capacity data, and a booking confirmation
 * echoes what the customer themselves typed — and the registry's output
 * allowlists are what keep that true rather than aspirational. Reply quality
 * on a text-only channel depends on the model being able to phrase what it
 * found.
 *
 * **Two answers are never the model's to phrase.** A tool may hand back a
 * `deterministicReply`, and when it does the loop stops immediately without
 * asking the provider again: the possession challenge (§5.1.1 puts the whole
 * verification exchange outside the LLM) and the booking confirmation (which
 * must be byte-identical across the matched and unmatched paths, and must
 * never promise a queue number). Everything else the model writes.
 */
@Injectable()
export class IntentOrchestratorService {
  private readonly logger = new Logger(IntentOrchestratorService.name);
  private readonly serviceConfig: CustomerServiceConfig;

  constructor(
    configService: ConfigService,
    private readonly providerResolver: AiProviderResolverService,
    private readonly toolRegistry: CsToolRegistry,
  ) {
    this.serviceConfig = resolveCustomerServiceConfig(configService);
  }

  get config(): CustomerServiceConfig {
    return this.serviceConfig;
  }

  /**
   * Composes one reply. Never throws: the caller is answering a customer on a
   * messaging app, where an exception has no representation. A provider that
   * is down returns `null` and the caller sends the unavailable template.
   */
  async composeReply(
    context: CsToolContext,
    history: readonly ConversationTurn[],
  ): Promise<IntentOrchestrationResult> {
    const toolInvocations: CsToolInvocationRecord[] = [];
    try {
      const { adapter, config } = await this.providerResolver.resolveActiveProvider();
      const toolDefinitions = buildCsToolWireDefinitions(this.toolRegistry.listTools());
      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: buildCsSystemPrompt(this.serviceConfig.clinicName) },
        ...history.map((turn) => ({
          role: turn.role === 'CUSTOMER' ? ('user' as const) : ('assistant' as const),
          content: turn.content,
        })),
      ];
      let lastContent = '';
      for (let round = 0; round < MAX_PROVIDER_ROUNDS; round += 1) {
        const result = await adapter.sendChatCompletion(config, {
          sessionExternalId: null,
          // The public channel is the patient channel as far as the provider
          // layer is concerned: an unauthenticated member of the public gets
          // the strictest treatment the safety layer offers, never the
          // clinician exceptions.
          channel: 'PATIENT',
          messages,
          contextPayload: {},
          ...(toolDefinitions.length === 0 ? {} : { tools: toolDefinitions }),
        });
        lastContent = result.content.trim();
        const executableCalls = result.toolCalls.slice(
          0,
          MAX_TOOL_CALLS_PER_MESSAGE - toolInvocations.length,
        );
        if (executableCalls.length === 0) {
          break;
        }
        const executed = await this.executeToolCalls(context, executableCalls);
        toolInvocations.push(...executed.map((call) => call.record));
        const deterministic = executed.find((call) => call.deterministicReply !== undefined);
        if (deterministic !== undefined) {
          return {
            replyContent: deterministic.deterministicReply ?? null,
            isDeterministic: true,
            requestContact: deterministic.requestContact === true,
            pausesConversation: deterministic.pausesConversation === true,
            toolInvocations,
          };
        }
        messages.push(
          { role: 'assistant', content: result.content, toolCalls: executableCalls },
          ...executed.map((call) => call.replayTurn),
        );
      }
      return {
        replyContent: lastContent === '' ? null : lastContent,
        isDeterministic: false,
        requestContact: false,
        pausesConversation: false,
        toolInvocations,
      };
    } catch (caughtError) {
      // No payload in the log: a provider error is free to quote the prompt
      // that produced it, and that prompt contains a customer's message.
      this.logger.warn(
        buildSafeErrorLog('cs_orchestration_failed', {
          conversationId: context.conversationId,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return {
        replyContent: null,
        isDeterministic: false,
        requestContact: false,
        pausesConversation: false,
        toolInvocations,
      };
    }
  }

  /**
   * Runs the model's requested lookups in order.
   *
   * A refused or failed call becomes a `FAILED` replay turn rather than an
   * exception, so one bad call costs the customer nothing but that lookup —
   * and the model is told the lookup failed rather than being left to narrate
   * what might have been there.
   */
  private async executeToolCalls(
    context: CsToolContext,
    toolCalls: readonly ChatToolCall[],
  ): Promise<ExecutedCsToolCall[]> {
    const executed: ExecutedCsToolCall[] = [];
    for (const toolCall of toolCalls) {
      executed.push(await this.executeSingleToolCall(context, toolCall));
    }
    return executed;
  }

  private async executeSingleToolCall(
    context: CsToolContext,
    toolCall: ChatToolCall,
  ): Promise<ExecutedCsToolCall> {
    try {
      const outcome = await this.toolRegistry.dispatchTool({
        context,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
      });
      return {
        record: {
          toolName: outcome.toolName,
          arguments: outcome.validatedArguments,
          outcome: 'SUCCESS',
          errorCode: null,
          resultCount: countResultItems(outcome.result),
        },
        replayTurn: {
          role: 'tool',
          content: JSON.stringify(outcome.result),
          toolCallId: toolCall.id,
          toolName: outcome.toolName,
        },
        ...(outcome.deterministicReply === undefined
          ? {}
          : { deterministicReply: outcome.deterministicReply }),
        ...(outcome.pausesConversation === undefined
          ? {}
          : { pausesConversation: outcome.pausesConversation }),
        ...(outcome.requestContact === undefined
          ? {}
          : { requestContact: outcome.requestContact }),
      };
    } catch (caughtError) {
      const errorCode =
        caughtError instanceof CustomerServiceError ? caughtError.code : 'CS_TOOL_EXECUTION_FAILED';
      this.logger.warn(
        buildSafeErrorLog('cs_tool_call_failed', {
          conversationId: context.conversationId,
          toolName: toolCall.name,
          errorCode,
        }),
      );
      return {
        record: {
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          outcome: 'FAILED',
          errorCode,
          resultCount: null,
        },
        replayTurn: {
          role: 'tool',
          // The code and nothing else. A tool failure's message can quote the
          // arguments that caused it, and on this channel those came from a
          // member of the public.
          content: JSON.stringify({ error: errorCode }),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        },
      };
    }
  }
}

/**
 * The length of whichever list a tool result carries, or null.
 *
 * Reads the two list-shaped results by name rather than looking for "the first
 * array": `book_appointment` returns an object with no list, and a generic
 * search would eventually find one somebody added for another reason and start
 * reporting it as a hit count.
 */
function countResultItems(result: unknown): number | null {
  if (typeof result !== 'object' || result === null) {
    return null;
  }
  const candidate = result as { passages?: unknown; sessions?: unknown };
  if (Array.isArray(candidate.passages)) {
    return candidate.passages.length;
  }
  if (Array.isArray(candidate.sessions)) {
    return candidate.sessions.length;
  }
  return null;
}
