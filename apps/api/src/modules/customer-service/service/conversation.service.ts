import { Injectable, Logger } from '@nestjs/common';

import {
  ConversationRecord,
  CsSafetyTagValue,
  CustomerServiceConfig,
  InboundChannelMessage,
  LLM_PAUSED_CONVERSATION_STATES,
} from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { InboundMessageSink } from '../../channel-gateway/service/inbound-message-sink.service';
import { OutboundMessageDispatcherService } from '../../channel-gateway/service/outbound-message-dispatcher.service';
import { ConversationRepository } from '../repository/conversation.repository';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';
import { CsSafetyPolicyService } from './cs-safety-policy.service';
import { IntentOrchestratorService } from './intent-orchestrator.service';

const HOUR_IN_MS = 3_600_000;

/**
 * The conversation core (`PCS-T06`, §4.2): resolve the conversation, run the
 * state machine, persist both sides of the exchange, and reply.
 *
 * This is the class that binds `InboundMessageSink` — the seam `PCS-T05` left
 * — so the gateway keeps containing zero business logic and this module never
 * learns which webhook delivered a message.
 *
 * **The state machine's only real question is whether the LLM may see this
 * message**, and four of the five states answer no. While a conversation is
 * `NEEDS_HUMAN`, `HUMAN_ACTIVE`, `AWAITING_OTP`, or `ARCHIVED`, inbound
 * messages are still persisted — the transcript stays complete, which is what
 * the admin takeover screen at `PCS-T08` will read — but they never reach a
 * provider. That is what makes "prompt injection cannot talk its way past a
 * handoff" structural: there is no prompt to inject into.
 *
 * The order of every inbound message is fixed and each step earns its place:
 *
 *   1. Resolve or create the conversation.
 *   2. Run the input guards — **including redaction, before anything is
 *      written down**.
 *   3. Persist the customer turn, post-redaction.
 *   4. If the state pauses the bot, stop. No reply, no provider call.
 *   5. Enforce the per-chat rate limit.
 *   6. Answer locally, or ask the model.
 *   7. Persist the reply and send it.
 */
@Injectable()
export class ConversationService extends InboundMessageSink {
  private readonly logger = new Logger(ConversationService.name);
  private readonly serviceConfig: CustomerServiceConfig;

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly safetyPolicy: CsSafetyPolicyService,
    private readonly intentOrchestrator: IntentOrchestratorService,
    private readonly outboundDispatcher: OutboundMessageDispatcherService,
  ) {
    super();
    this.serviceConfig = this.intentOrchestrator.config;
  }

  async handleInboundMessage(message: InboundChannelMessage): Promise<void> {
    const conversation = await this.conversationRepository.findOrCreateConversation(message);
    const decision = this.safetyPolicy.evaluateInput(message.text);

    // Persisted post-redaction and before any branch: a message that is about
    // to be blocked is still part of the transcript, and the identifier it
    // carried must already be gone by the time it lands.
    await this.conversationRepository.appendMessage({
      conversationId: conversation.id,
      role: 'CUSTOMER',
      content: decision.content,
      safetyTags: decision.safetyTags,
    });

    if (this.isBotPaused(conversation)) {
      // Recorded, not answered. A human owns this conversation — or an OTP
      // sub-flow does — and a bot replying over either is the failure the
      // state machine exists to prevent.
      this.logger.log(
        `Inbound message held: conversation ${conversation.id} is ${conversation.state}`,
      );
      return;
    }

    if (await this.isOverRateLimit(conversation.id)) {
      await this.replyWith(conversation, CS_REPLY_TEMPLATES.rateLimited, ['rate_limited'], 'SYSTEM');
      return;
    }

    await this.sendPrivacyNoticeOnce(conversation);

    if (decision.outcome === 'ANSWER_LOCALLY') {
      await this.replyWith(conversation, decision.replyContent, decision.safetyTags, 'SYSTEM');
      if (decision.shouldHandOff) {
        await this.conversationRepository.updateState(conversation.id, 'NEEDS_HUMAN');
      }
      return;
    }

    const history = await this.conversationRepository.listRecentTurns(
      conversation.id,
      this.serviceConfig.historyTurnLimit,
    );
    const orchestration = await this.intentOrchestrator.composeReply(history);
    if (orchestration.replyContent === null) {
      await this.replyWith(
        conversation,
        CS_REPLY_TEMPLATES.providerUnavailable,
        ['provider_unavailable'],
        'SYSTEM',
      );
      return;
    }
    await this.replyWith(conversation, orchestration.replyContent, [], 'BOT');
  }

  /**
   * Derived from the shared list rather than written as a branch, so a state
   * added later has to be classified deliberately instead of defaulting into
   * the half that reaches the model.
   */
  private isBotPaused(conversation: ConversationRecord): boolean {
    return LLM_PAUSED_CONVERSATION_STATES.some((state) => state === conversation.state);
  }

  private async isOverRateLimit(conversationId: string): Promise<boolean> {
    const since = new Date(Date.now() - HOUR_IN_MS);
    const count = await this.conversationRepository.countCustomerMessagesSince(
      conversationId,
      since,
    );
    return count > this.serviceConfig.rateLimitPerChatHour;
  }

  /**
   * §8.2's notice, once per conversation, before the first substantive reply.
   *
   * Sent as its own message rather than prepended to the first answer,
   * because a notice glued to the front of an answer is a notice nobody
   * reads. The flag is set only after the send succeeds, so a customer whose
   * first message failed to deliver still receives it next time.
   */
  private async sendPrivacyNoticeOnce(conversation: ConversationRecord): Promise<void> {
    if (conversation.hasSentNotice) {
      return;
    }
    await this.replyWith(conversation, CS_REPLY_TEMPLATES.privacyNotice, [], 'SYSTEM');
    await this.conversationRepository.markNoticeSent(conversation.id);
  }

  /**
   * Persists a reply and sends it.
   *
   * **Persisted before dispatch**, so the transcript records what this clinic
   * decided to say even if the gateway then failed to deliver it — the
   * opposite order would lose exactly the replies worth investigating. A
   * delivery failure is logged rather than thrown: the inbound message has
   * already been claimed by the gateway's dedup, so throwing would neither
   * retry it nor tell the customer anything.
   */
  private async replyWith(
    conversation: ConversationRecord,
    content: string,
    safetyTags: readonly CsSafetyTagValue[],
    role: 'BOT' | 'SYSTEM',
  ): Promise<void> {
    await this.conversationRepository.appendMessage({
      conversationId: conversation.id,
      role,
      content,
      safetyTags,
    });
    try {
      await this.outboundDispatcher.sendMessage({
        channel: conversation.channel,
        externalChatId: conversation.externalChatId,
        text: content,
      });
    } catch (caughtError) {
      this.logger.error(
        buildSafeErrorLog('cs_reply_delivery_failed', {
          conversationId: conversation.id,
          channel: conversation.channel,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
    }
  }
}
