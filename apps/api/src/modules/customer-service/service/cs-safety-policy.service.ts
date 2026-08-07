import { Injectable } from '@nestjs/common';

import { CsInputDecision, CsSafetyTagValue } from '@hms/shared-types';

import { AI_CHAT_SAFETY_PATTERNS } from '../../ai-chatbot/service/ai-chat-safety-patterns';
import { CS_EMERGENCY_PATTERNS } from './cs-emergency-patterns';
import { CS_HANDOFF_REQUEST_PATTERNS } from './cs-handoff-request-patterns';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';
import { redactCustomerMessage } from './redact-customer-message';

/**
 * The channel's input guards (§5.3, §6, D-CS-03).
 *
 * Distinct from the in-app `SafetyPolicyService` and deliberately so, though
 * it reuses that service's *patterns*: the two channels differ in who is on
 * the other end. In-app, a signed-in clinician gets a diagnosis reply
 * annotated rather than replaced; here the other end is an unauthenticated
 * member of the public, and there is no equivalent exception to make. The
 * patterns are shared because a phrase that is prompt injection in one
 * channel is prompt injection in the other, and maintaining two copies is how
 * one of them silently falls behind.
 *
 * **Order is the design.** Redaction runs first and unconditionally, so a
 * message that is *both* an injection attempt and carries a NIK has the NIK
 * stripped before anything else decides what to do with it — a blocked
 * message is still persisted, and persisting the identifier would defeat the
 * point. Emergencies are checked before injection, because a real emergency
 * phrased clumsily must not lose to a pattern match. Everything that resolves
 * here resolves **without a provider call**.
 */
@Injectable()
export class CsSafetyPolicyService {
  /**
   * Runs every input guard and returns what should happen to the message.
   *
   * Never throws. The in-app service throws `AI_SAFETY_BLOCKED` because it
   * answers an HTTP request that can carry an error code; here the caller is
   * a webhook that must reply to a customer on WhatsApp, and "throw" has no
   * customer-visible meaning. Every path returns something to say.
   */
  evaluateInput(rawContent: string): CsInputDecision {
    const safetyTags: CsSafetyTagValue[] = [];
    // First and unconditional: a blocked message is still persisted, so an
    // identifier stripped after the block decision would still have been
    // written down.
    const redaction = redactCustomerMessage(rawContent.trim());
    if (redaction.wasRedacted) {
      safetyTags.push('sensitive_data_redacted');
    }
    const content = redaction.content;

    if (
      this.matchesAny(content, AI_CHAT_SAFETY_PATTERNS.emergency) ||
      this.matchesAny(content, CS_EMERGENCY_PATTERNS)
    ) {
      // Before the injection check on purpose: someone describing chest pain
      // in clumsy phrasing must not lose the ambulance number to a pattern
      // match, and this reply costs nothing to give.
      return this.answerLocally(content, [...safetyTags, 'emergency_escalation'], {
        replyContent: CS_REPLY_TEMPLATES.emergency,
        shouldHandOff: true,
      });
    }
    if (
      this.matchesAny(content, AI_CHAT_SAFETY_PATTERNS.promptInjection) ||
      this.matchesAny(content, AI_CHAT_SAFETY_PATTERNS.impersonation)
    ) {
      // A flat refusal that names no pattern. Anything more specific is a
      // free hint for the next attempt.
      return this.answerLocally(content, [...safetyTags, 'prompt_injection_blocked'], {
        replyContent: CS_REPLY_TEMPLATES.injectionBlocked,
        shouldHandOff: false,
      });
    }
    if (this.matchesAny(content, CS_HANDOFF_REQUEST_PATTERNS)) {
      return this.answerLocally(content, [...safetyTags, 'handoff_requested'], {
        replyContent: CS_REPLY_TEMPLATES.handoff,
        shouldHandOff: true,
      });
    }
    if (redaction.wasRedacted) {
      // Answered locally rather than passed on. The model has nothing useful
      // to add to "bring your card to the clinic", and sending a turn whose
      // identifiers were just stripped is the one exchange most likely to
      // make a model ask for them again.
      return this.answerLocally(content, safetyTags, {
        replyContent: CS_REPLY_TEMPLATES.sensitiveDataVolunteered,
        shouldHandOff: false,
      });
    }
    return { outcome: 'SEND_TO_MODEL', content, safetyTags };
  }

  private answerLocally(
    content: string,
    safetyTags: CsSafetyTagValue[],
    reply: { replyContent: string; shouldHandOff: boolean },
  ): CsInputDecision {
    return {
      outcome: 'ANSWER_LOCALLY',
      content,
      safetyTags,
      replyContent: reply.replyContent,
      shouldHandOff: reply.shouldHandOff,
    };
  }

  private matchesAny(content: string, patterns: readonly RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(content));
  }
}
