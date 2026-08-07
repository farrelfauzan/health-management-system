import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConversationTurn, CustomerServiceConfig } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AiProviderResolverService } from '../../ai-chatbot/service/ai-provider-resolver.service';
import { resolveCustomerServiceConfig } from '../customer-service.config';
import { buildCsSystemPrompt } from './build-cs-system-prompt';

/**
 * What one orchestration produced. `null` content means the provider could
 * not be reached or answered with nothing — the caller sends a template
 * rather than silence.
 */
export type IntentOrchestrationResult = {
  replyContent: string | null;
};

/**
 * Turns a customer's message into a reply, using the clinic's configured
 * provider (§6).
 *
 * **There is no separate intent classifier** (D-CS-07). §6 settles this: the
 * tool loop *is* the classification — the model's choice of tool is the
 * intent decision, and "no tool plus a template reply" covers greetings,
 * thanks, and out-of-scope topics. A classifier stage would double the
 * latency of a channel where people expect a reply in seconds, to produce a
 * label the next call would derive anyway.
 *
 * **The tool catalogue is empty in this slice.** `PCS-T07` registers
 * `search_faq`, `list_available_sessions`, and `book_appointment`; until then
 * the model answers from the system prompt alone, which is why the prompt
 * carries the no-answering-from-memory rule and why the FAQ questions this
 * channel exists for will honestly say they have no information yet. Shipping
 * the loop without its tools is deliberate: the conversation core, the
 * transcript, and the guards are what need to be exercised on real traffic
 * first (D-CS-05), and a bot that answers "I don't have that written down" is
 * a safe thing to point a pilot Telegram bot at.
 *
 * Provider access goes through the Phase 13 `AiProviderResolverService`, so
 * the clinic's one configured vendor and its encrypted key serve web chat and
 * this channel alike — a second provider stack for the same clinic would be a
 * second place to rotate a key and a second thing to forget.
 */
@Injectable()
export class IntentOrchestratorService {
  private readonly logger = new Logger(IntentOrchestratorService.name);
  private readonly serviceConfig: CustomerServiceConfig;

  constructor(
    configService: ConfigService,
    private readonly providerResolver: AiProviderResolverService,
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
  async composeReply(history: readonly ConversationTurn[]): Promise<IntentOrchestrationResult> {
    try {
      const { adapter, config } = await this.providerResolver.resolveActiveProvider();
      const result = await adapter.sendChatCompletion(config, {
        sessionExternalId: null,
        // The public channel is the patient channel as far as the provider
        // layer is concerned: an unauthenticated member of the public gets
        // the strictest treatment the safety layer offers, never the
        // clinician exceptions.
        channel: 'PATIENT',
        messages: [
          { role: 'system', content: buildCsSystemPrompt(this.serviceConfig.clinicName) },
          ...history.map((turn) => ({
            role: turn.role === 'CUSTOMER' ? ('user' as const) : ('assistant' as const),
            content: turn.content,
          })),
        ],
        contextPayload: {},
        tools: [],
      });
      const replyContent = result.content.trim();
      return { replyContent: replyContent === '' ? null : replyContent };
    } catch (caughtError) {
      // No payload in the log: a provider error is free to quote the prompt
      // that produced it, and that prompt contains a customer's message.
      this.logger.warn(
        buildSafeErrorLog('cs_orchestration_failed', {
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return { replyContent: null };
    }
  }
}
