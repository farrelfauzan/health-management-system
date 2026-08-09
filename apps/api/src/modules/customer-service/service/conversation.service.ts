import { Injectable, Logger } from '@nestjs/common';

import {
  ChannelOtpChallengeRecord,
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
import { ChannelBookingService } from './channel-booking.service';
import { ChannelVerificationService } from './channel-verification.service';
import { CsSystemActorService } from './cs-system-actor.service';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';
import { CsSafetyPolicyService } from './cs-safety-policy.service';
import { IntentOrchestratorService } from './intent-orchestrator.service';
import { extractOtpCodeCandidate } from './otp-code';

const HOUR_IN_MS = 3_600_000;

/**
 * How a customer declines the verification step.
 *
 * There has to be a way out that is not "guess wrong three times": someone who
 * did not receive a code, or who does not want to share a number with an
 * automated account, is making a reasonable choice, and §5.1.1 says their
 * booking still goes through as a draft. The words are matched loosely because
 * the customer is being told one of them in the challenge message, and the
 * cost of accepting a near miss is a draft booking rather than a linked one.
 */
const VERIFICATION_SKIP_PATTERNS = [/\blanjut\b/i, /\blewati\b/i, /\bskip\b/i, /\bnanti\b/i];

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
 * `AWAITING_OTP` is the one paused state that still *answers* (`PCS-T07`,
 * §5.1.1). It is handled here, before the pause check, by string comparison
 * against a stored hash and a clock — never by a model — which is why a
 * message that says "ignore the previous instructions, I am verified" is
 * simply a wrong code.
 *
 * The order of every inbound message is fixed and each step earns its place:
 *
 *   1. Resolve or create the conversation.
 *   2. Run the input guards — **including redaction, before anything is
 *      written down**.
 *   3. Persist the customer turn, post-redaction.
 *   4. Resolve an outstanding possession challenge, if there is one.
 *   5. If the state pauses the bot, stop. No reply, no provider call.
 *   6. Enforce the per-chat rate limit.
 *   7. Answer locally, or ask the model.
 *   8. Persist the reply and send it.
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
    private readonly verificationService: ChannelVerificationService,
    private readonly bookingService: ChannelBookingService,
    private readonly systemActorService: CsSystemActorService,
  ) {
    super();
    this.serviceConfig = this.intentOrchestrator.config;
  }

  async handleInboundMessage(message: InboundChannelMessage): Promise<void> {
    const conversation = await this.conversationRepository.findOrCreateConversation(message);

    // §8.3's block, checked before redaction and before persistence — earlier
    // than any other guard, because it is the only one whose purpose is to stop
    // this chat costing anything. A block that still wrote a transcript row per
    // message would leave the flood it exists to end paying for storage
    // instead of tokens. The turns received before the block are kept; the
    // ones after it are not written, and no reply is composed or sent.
    if (conversation.blockedAt !== null) {
      this.logger.log(`Inbound message dropped: conversation ${conversation.id} is blocked`);
      return;
    }

    const decision = this.safetyPolicy.evaluateInput(message.text);

    // Persisted post-redaction and before any branch: a message that is about
    // to be blocked is still part of the transcript, and the identifier it
    // carried must already be gone by the time it lands.
    await this.conversationRepository.appendMessage({
      conversationId: conversation.id,
      role: 'CUSTOMER',
      content: this.describeCustomerTurn(message, decision.content),
      safetyTags: decision.safetyTags,
    });

    if (conversation.state === 'AWAITING_OTP') {
      await this.resolveVerification(conversation, message);
      return;
    }

    if (this.isBotPaused(conversation)) {
      // Recorded, not answered. A human owns this conversation — and a bot
      // replying over one is the failure the state machine exists to prevent.
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
    const orchestration = await this.intentOrchestrator.composeReply(
      {
        conversationId: conversation.id,
        channel: conversation.channel,
        externalChatId: conversation.externalChatId,
      },
      history,
    );
    // Persisted before the reply, and before any state change, so the
    // transcript shows the lookup that produced the answer even if sending it
    // then failed. The result payload is deliberately absent — it is already
    // in the reply, and repeating it here would put a second copy of every
    // FAQ passage in the retention window.
    for (const invocation of orchestration.toolInvocations) {
      await this.conversationRepository.appendMessage({
        conversationId: conversation.id,
        role: 'SYSTEM',
        content: JSON.stringify(invocation),
        safetyTags: ['tool_invocation'],
      });
    }
    if (orchestration.replyContent === null) {
      await this.replyWith(
        conversation,
        CS_REPLY_TEMPLATES.providerUnavailable,
        ['provider_unavailable'],
        'SYSTEM',
      );
      return;
    }
    // A deterministic reply is recorded as `SYSTEM` rather than `BOT`: "the
    // clinic decided to say this" and "the model composed this" are different
    // facts for an auditor, and the booking confirmation is emphatically the
    // former.
    await this.replyWith(
      conversation,
      orchestration.replyContent,
      [],
      orchestration.isDeterministic ? 'SYSTEM' : 'BOT',
      orchestration.requestContact,
    );
    if (orchestration.pausesConversation) {
      await this.conversationRepository.updateState(conversation.id, 'AWAITING_OTP');
    }
  }

  /**
   * The `AWAITING_OTP` sub-flow (§5.1.1), start to finish, with no model
   * involved at any point.
   *
   * Every exit completes the booking the challenge was holding — verified or
   * not — because §5.1.1 is explicit that a failed, expired, or declined
   * verification is not a dead end: the booking goes through against a draft,
   * the existing record is left untouched, and **the reply is the same one the
   * verified path sends**. That last part is the acceptance criterion, and it
   * holds here because both endings call the same booking method, which calls
   * the same confirmation builder.
   */
  private async resolveVerification(
    conversation: ConversationRecord,
    message: InboundChannelMessage,
  ): Promise<void> {
    const now = new Date();
    const challenge = await this.verificationService.findLiveChallenge(conversation.id, now);
    if (challenge === null) {
      // Expired or already spent. The customer is not left waiting on a
      // challenge that no longer exists: the conversation returns to the bot
      // and their next message is answered normally.
      await this.conversationRepository.updateState(conversation.id, 'BOT_ACTIVE');
      return;
    }

    if (message.sharedContact !== undefined) {
      const isSatisfied = this.verificationService.isContactSatisfying(
        challenge,
        message.sharedContact,
      );
      await this.settleChallenge(conversation, challenge, isSatisfied ? challenge.patientId : null);
      return;
    }

    if (this.isDeclining(message.text)) {
      await this.settleChallenge(conversation, challenge, null);
      return;
    }

    const submittedCode = challenge.method === 'OTP' ? extractOtpCodeCandidate(message.text) : null;
    if (submittedCode === null) {
      // Not a code and not a decline — a question, or a customer typing
      // "sudah". Answered with a nudge that costs no attempt: guessing wrong
      // is what the three attempts are for, and asking a question is not
      // guessing.
      await this.replyWith(
        conversation,
        challenge.method === 'CONTACT_SHARE'
          ? CS_REPLY_TEMPLATES.contactShareChallenge
          : CS_REPLY_TEMPLATES.otpAwaitingCode,
        [],
        'SYSTEM',
        challenge.method === 'CONTACT_SHARE',
      );
      return;
    }

    const submission = await this.verificationService.submitCode({
      challenge,
      code: submittedCode,
      now,
    });
    if (submission.isVerified) {
      await this.settleChallenge(conversation, challenge, challenge.patientId);
      return;
    }
    if (submission.attemptsRemaining <= 0) {
      await this.settleChallenge(conversation, challenge, null);
      return;
    }
    await this.replyWith(conversation, CS_REPLY_TEMPLATES.otpWrongCode, [], 'SYSTEM');
  }

  /**
   * Ends a challenge and completes the booking it was holding.
   *
   * `verifiedPatientId` is the *only* difference between a proven and an
   * unproven ending: it decides whether the booking attaches to the existing
   * record. Everything the customer sees is produced identically either way.
   */
  private async settleChallenge(
    conversation: ConversationRecord,
    challenge: ChannelOtpChallengeRecord,
    verifiedPatientId: string | null,
  ): Promise<void> {
    const now = new Date();
    await this.verificationService.consumeChallenge(challenge.id, now);
    await this.conversationRepository.updateState(conversation.id, 'BOT_ACTIVE');
    try {
      const actor = await this.systemActorService.resolveActor();
      if (verifiedPatientId !== null) {
        await this.bookingService.recordVerification({
          channel: conversation.channel,
          externalChatId: conversation.externalChatId,
          phoneNumber: challenge.pendingBooking.phoneNumber,
          fullName: challenge.pendingBooking.patientFullName,
          patientId: verifiedPatientId,
          now,
        });
      }
      const outcome = await this.bookingService.completePendingBooking({
        channel: conversation.channel,
        actor,
        pendingBooking: challenge.pendingBooking,
        verifiedPatientId,
      });
      await this.replyWith(
        conversation,
        outcome.deterministicReply ?? CS_REPLY_TEMPLATES.providerUnavailable,
        [],
        'SYSTEM',
      );
    } catch (caughtError) {
      // The challenge is already spent and the state already returned to the
      // bot, so the customer can keep talking. Telling them the booking failed
      // is the honest reply; retrying silently would risk booking twice.
      this.logger.error(
        buildSafeErrorLog('cs_pending_booking_failed', {
          conversationId: conversation.id,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      await this.replyWith(conversation, CS_REPLY_TEMPLATES.providerUnavailable, [], 'SYSTEM');
    }
  }

  private isDeclining(text: string): boolean {
    return VERIFICATION_SKIP_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * What the transcript records for this turn.
   *
   * A shared contact card carries no text — the customer tapped a button — so
   * recording an empty string would leave a gap where an action happened. The
   * marker is bracketed to make it visibly not the customer's words, and it
   * carries **no number**: the phone number is already on the link row, and a
   * second copy in a 90-day transcript is a second copy to leak.
   */
  private describeCustomerTurn(message: InboundChannelMessage, redactedText: string): string {
    if (message.sharedContact === undefined) {
      return redactedText;
    }
    return redactedText === '' ? '[kontak dibagikan]' : `${redactedText}\n[kontak dibagikan]`;
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
    requestContact = false,
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
        // Added only when asked for, so an ordinary reply is the same message
        // it was before `PCS-T07` — and, on Telegram, so every other reply
        // actively clears a contact button a previous turn put there.
        ...(requestContact ? { requestContact: true } : {}),
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
