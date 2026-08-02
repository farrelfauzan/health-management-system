import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatChannelValue, ChatSafetyTagValue } from '@hms/shared-types';

import { AiChatbotError } from '../ai-chatbot.error';
import { AI_CHAT_CLINICAL_JUDGEMENT_NOTICE } from './ai-chat-clinical-judgement-notice';
import { AI_CHAT_EMERGENCY_TEMPLATE } from './ai-chat-emergency-template';
import { AI_CHAT_SAFETY_PATTERNS } from './ai-chat-safety-patterns';
import { AI_CHAT_UNCERTAINTY_NOTICE } from './ai-chat-uncertainty-notice';
import { sanitizeChatMarkup } from './sanitize-chat-markup';

const DEFAULT_MESSAGES_PER_HOUR = 60;
const DEFAULT_SESSIONS_PER_DAY = 20;
const HOUR_IN_MS = 3_600_000;
const DAY_IN_MS = 86_400_000;
const TAB_CODE_POINT = 0x09;
const LINE_FEED_CODE_POINT = 0x0a;
const CARRIAGE_RETURN_CODE_POINT = 0x0d;
const FIRST_PRINTABLE_CODE_POINT = 0x20;
const NON_CHARACTER_CODE_POINTS: readonly number[] = [0xfffe, 0xffff];

/**
 * The §3.2 "binary input" check. Written as a codepoint scan rather than a
 * regex because a character class over this range is exactly what
 * `no-control-regex` exists to catch, and the intent reads better spelled
 * out: tab, newline and carriage return are legitimate in a typed message;
 * every other C0 control character, and the two Unicode non-characters, mean
 * the payload is not text a patient wrote.
 */
function hasBinaryContent(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === TAB_CODE_POINT ||
      codePoint === LINE_FEED_CODE_POINT ||
      codePoint === CARRIAGE_RETURN_CODE_POINT
    ) {
      continue;
    }
    if (codePoint < FIRST_PRINTABLE_CODE_POINT || NON_CHARACTER_CODE_POINTS.includes(codePoint)) {
      return true;
    }
  }
  return false;
}

/**
 * What the input guards decided. `ESCALATE` is not a failure: the message is
 * accepted and answered from the deterministic emergency template without
 * ever reaching the provider.
 */
export type ChatInputDecision =
  | { outcome: 'ALLOW'; safetyTags: ChatSafetyTagValue[] }
  | { outcome: 'ESCALATE'; safetyTags: ChatSafetyTagValue[]; replyContent: string };

export type ChatOutputDecision = {
  content: string;
  safetyTags: ChatSafetyTagValue[];
};

/**
 * The §3 safety controls. The per-channel system prompts and the context
 * preamble *ask* a model to behave; this service is what *makes* it — every
 * rule here holds whether or not the provider cooperated, and none of it
 * depends on the upstream being honest.
 *
 * Three shapes of control:
 *
 * - **Refuse** (`AI_SAFETY_BLOCKED`) for input that attacks the policy
 *   itself — prompt injection and clinician impersonation. There is no
 *   legitimate reading of "ignore your previous instructions", so it never
 *   reaches the provider and never costs the clinic a token.
 * - **Answer without the provider** (`ESCALATE`) for emergency symptoms. When
 *   someone describes chest pain, the right response must not depend on an
 *   upstream API being reachable or on a model choosing well.
 * - **Repair** for output. A reply that asserts a diagnosis or issues a dose
 *   is rewritten to a redirect, over-confident phrasing gains the uncertainty
 *   notice, and markup is stripped — because a patient who asked a real
 *   question is better served by a corrected answer than by an error. One
 *   exception (ai-chatbot-tools.md §2.3): a doctor-channel diagnosis match
 *   keeps the reply and appends the clinical-judgement notice — the
 *   no-diagnosis rule protects laypeople, and a licensed clinician is not
 *   one. Detection is unchanged; only the remedy differs.
 *
 * Every intervention records a tag on the persisted turn, so the P13-T11
 * review can count what the guards actually caught in production instead of
 * trusting that they were never needed.
 */
@Injectable()
export class SafetyPolicyService {
  private readonly messagesPerHour: number;
  private readonly sessionsPerDay: number;

  constructor(configService: ConfigService) {
    this.messagesPerHour = this.readPositiveInteger(
      configService,
      'AI_CHAT_RATE_LIMIT_PER_HOUR',
      DEFAULT_MESSAGES_PER_HOUR,
    );
    this.sessionsPerDay = this.readPositiveInteger(
      configService,
      'AI_CHAT_MAX_SESSIONS_PER_DAY',
      DEFAULT_SESSIONS_PER_DAY,
    );
  }

  /**
   * The quota windows and limits the orchestration passes into the
   * quota-guarded repository writes. Counting here and inserting there would
   * be two statements and therefore not a limit at all — a concurrent burst
   * reads the same pre-limit count and every request in it passes — so this
   * service owns the *policy* and the repository enforces it atomically.
   */
  get messageQuota(): { since: Date; limit: number } {
    return { since: new Date(Date.now() - HOUR_IN_MS), limit: this.messagesPerHour };
  }

  get sessionQuota(): { since: Date; limit: number } {
    return { since: new Date(Date.now() - DAY_IN_MS), limit: this.sessionsPerDay };
  }

  buildMessageQuotaError(): AiChatbotError {
    return new AiChatbotError(
      'AI_RATE_LIMITED',
      `Chat message limit reached (${this.messagesPerHour} per hour); try again later`,
    );
  }

  buildSessionQuotaError(): AiChatbotError {
    return new AiChatbotError(
      'AI_RATE_LIMITED',
      `Chat session limit reached (${this.sessionsPerDay} per day); try again later`,
    );
  }

  /**
   * Runs the §3.2 *content* guards. Purely local and synchronous — the
   * quotas are enforced by the repository at write time, because a limit
   * that counts in one statement and writes in another is not a limit.
   */
  evaluateInput(content: string): ChatInputDecision {
    const trimmedContent = content.trim();
    if (trimmedContent === '' || hasBinaryContent(content)) {
      throw new AiChatbotError('AI_SAFETY_BLOCKED', 'The message is empty or contains binary data');
    }
    if (this.matchesAny(trimmedContent, AI_CHAT_SAFETY_PATTERNS.promptInjection)) {
      throw new AiChatbotError(
        'AI_SAFETY_BLOCKED',
        'The message attempts to override the assistant’s safety instructions',
      );
    }
    if (this.matchesAny(trimmedContent, AI_CHAT_SAFETY_PATTERNS.impersonation)) {
      throw new AiChatbotError(
        'AI_SAFETY_BLOCKED',
        'The assistant cannot act as a doctor, nurse, or pharmacist',
      );
    }
    // Emergencies bypass the rate limit deliberately: a quota is an
    // anti-abuse measure, and refusing to show someone the ambulance number
    // because they have chatted a lot today is not a trade HMS will make.
    if (this.matchesAny(trimmedContent, AI_CHAT_SAFETY_PATTERNS.emergency)) {
      return {
        outcome: 'ESCALATE',
        safetyTags: ['emergency_escalation'],
        replyContent: AI_CHAT_EMERGENCY_TEMPLATE,
      };
    }
    return { outcome: 'ALLOW', safetyTags: [] };
  }

  /**
   * Runs the §3.3 output guards. Ordering matters: markup is stripped first
   * so a reply cannot hide an assertion inside a tag, then the hard rules are
   * applied to the visible text. A diagnosis match replaces the reply on the
   * patient channel but only annotates it on the doctor channel
   * (ai-chatbot-tools.md §2.3) — and the prescription guard still runs on an
   * annotated doctor reply, so a dose cannot ride along with a diagnosis.
   */
  evaluateOutput(content: string, channel: ChatChannelValue): ChatOutputDecision {
    const safetyTags: ChatSafetyTagValue[] = [];
    const sanitized = sanitizeChatMarkup(content);
    if (sanitized.wasModified) {
      safetyTags.push('markup_stripped');
    }
    let resultContent = sanitized.content;
    const hasDiagnosisAssertion = this.matchesAny(
      resultContent,
      AI_CHAT_SAFETY_PATTERNS.diagnosisAssertion,
    );
    if (hasDiagnosisAssertion) {
      safetyTags.push('diagnosis_attempt');
    }
    if (hasDiagnosisAssertion && channel !== 'DOCTOR') {
      return { content: this.buildRefusalReply(channel, 'diagnosis'), safetyTags };
    }
    if (this.matchesAny(resultContent, AI_CHAT_SAFETY_PATTERNS.prescriptionAssertion)) {
      safetyTags.push('prescription_attempt');
      return { content: this.buildRefusalReply(channel, 'prescription'), safetyTags };
    }
    if (hasDiagnosisAssertion) {
      resultContent = `${resultContent}\n\n${AI_CHAT_CLINICAL_JUDGEMENT_NOTICE}`;
    }
    if (this.matchesAny(resultContent, AI_CHAT_SAFETY_PATTERNS.clinicalCertainty)) {
      safetyTags.push('uncertainty_appended');
      resultContent = `${resultContent}\n\n${AI_CHAT_UNCERTAINTY_NOTICE}`;
    }
    return { content: resultContent, safetyTags };
  }

  /**
   * Replaces an unsafe reply rather than surfacing an error. The user asked
   * a real question; the honest answer is that this assistant cannot answer
   * it and who can. The doctor channel gets different copy because a
   * clinician is not being told to see a clinician — and it can only reach
   * here for a prescription, since a doctor-channel diagnosis match appends
   * a notice instead of refusing.
   */
  private buildRefusalReply(
    channel: ChatChannelValue,
    kind: 'diagnosis' | 'prescription',
  ): string {
    if (channel === 'DOCTOR') {
      return 'Saya tidak dapat meresepkan atau menentukan dosis untuk pasien tertentu. Saya dapat menjelaskan informasi golongan obat secara umum.\n\nI cannot prescribe or set a dose for a specific patient. I can explain general drug-class information instead.';
    }
    return kind === 'diagnosis'
      ? 'Maaf, saya tidak dapat memastikan penyakit atau memberikan diagnosis. Untuk mengetahui kondisi Anda, silakan periksakan diri ke tenaga kesehatan di klinik.\n\nSorry, I cannot determine an illness or provide a diagnosis. Please see a healthcare professional at the clinic to find out about your condition.'
      : 'Maaf, saya tidak dapat meresepkan obat atau menentukan dosis. Silakan konsultasikan dengan dokter atau apoteker di klinik.\n\nSorry, I cannot prescribe medication or set a dose. Please consult a doctor or pharmacist at the clinic.';
  }

  private matchesAny(content: string, patterns: readonly RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(content));
  }

  private readPositiveInteger(
    configService: ConfigService,
    key: string,
    fallback: number,
  ): number {
    const rawValue = configService.get<string>(key)?.trim();
    if (rawValue === undefined || rawValue === '') {
      return fallback;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`AI chat configuration error: ${key} must be a positive integer`);
    }
    return parsed;
  }
}
