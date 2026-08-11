import { ConfigService } from '@nestjs/config';

import { CustomerServiceConfig } from '@hms/shared-types';

const DEFAULT_HISTORY_TURN_LIMIT = 20;
/**
 * §8.3's daily clinic-wide LLM budget, in provider calls.
 *
 * 2000 is roughly a hundred customers holding twenty-turn conversations in one
 * day — comfortably above what a pilot clinic generates and far below what a
 * script does in an hour. It is a **circuit breaker, not a quota**: reaching
 * it should be an incident somebody investigates, not a number the clinic
 * bumps into on a busy Tuesday.
 */
const DEFAULT_MAX_LLM_CALLS_PER_DAY = 2000;

/**
 * Distinct chats that may fail a challenge against one patient record in a day
 * before the conversation is flagged (§8.3).
 *
 * Three, and it is a *flag* rather than a block for a reason: the same shape
 * is produced by a family sharing one registered number — a parent, then an
 * adult child, then a sibling, each typing the number they know. Blocking
 * would turn a normal Tuesday at an Indonesian clinic into three refused
 * bookings; flagging puts a person in front of it, which is what tells the
 * two cases apart.
 */
const DEFAULT_ENUMERATION_CHAT_THRESHOLD = 3;

const DEFAULT_RATE_LIMIT_PER_CHAT_HOUR = 20;
const DEFAULT_CLINIC_NAME = 'klinik kami';
const DEFAULT_OTP_TTL_SECONDS = 300;
const DEFAULT_OTP_MAX_ATTEMPTS = 3;
const DEFAULT_OTP_MAX_CHALLENGES_PER_DAY = 3;
const DEFAULT_LINK_REVERIFY_DAYS = 180;
const DEFAULT_MAX_ACTIVE_BOOKINGS_PER_PHONE = 3;
const DEFAULT_MAX_DRAFT_BOOKINGS_PER_DAY = 50;

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = configService.get<string>(key)?.trim();
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Customer-service configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

/**
 * Resolves the conversational layer's configuration (§6, §8.3, §8.5).
 *
 * The history window is 20 turns because that is what §6 bounds the loop at,
 * and the reason is cost rather than quality: a WhatsApp conversation has no
 * natural end, so an unbounded replay would make the hundredth message of a
 * chat cost a hundred messages' worth of tokens to answer.
 *
 * The clinic name has a generic fallback rather than throwing. It only ever
 * appears in the system prompt, and a channel that refuses to boot because
 * nobody set a display name would be trading a working feature for a
 * cosmetic one.
 */
export function resolveCustomerServiceConfig(configService: ConfigService): CustomerServiceConfig {
  return {
    historyTurnLimit: readPositiveInteger(
      configService,
      'CS_HISTORY_TURN_LIMIT',
      DEFAULT_HISTORY_TURN_LIMIT,
    ),
    rateLimitPerChatHour: readPositiveInteger(
      configService,
      'CS_RATE_LIMIT_PER_CHAT_HOUR',
      DEFAULT_RATE_LIMIT_PER_CHAT_HOUR,
    ),
    maxLlmCallsPerDay: readPositiveInteger(
      configService,
      'CS_MAX_LLM_CALLS_PER_DAY',
      DEFAULT_MAX_LLM_CALLS_PER_DAY,
    ),
    clinicName: configService.get<string>('CS_CLINIC_NAME')?.trim() || DEFAULT_CLINIC_NAME,
    booking: {
      otpTtlSeconds: readPositiveInteger(
        configService,
        'CS_OTP_TTL_SECONDS',
        DEFAULT_OTP_TTL_SECONDS,
      ),
      otpMaxAttempts: readPositiveInteger(
        configService,
        'CS_OTP_MAX_ATTEMPTS',
        DEFAULT_OTP_MAX_ATTEMPTS,
      ),
      otpMaxChallengesPerDay: readPositiveInteger(
        configService,
        'CS_OTP_MAX_CHALLENGES_PER_DAY',
        DEFAULT_OTP_MAX_CHALLENGES_PER_DAY,
      ),
      linkReverifyDays: readPositiveInteger(
        configService,
        'CS_LINK_REVERIFY_DAYS',
        DEFAULT_LINK_REVERIFY_DAYS,
      ),
      enumerationChatThreshold: readPositiveInteger(
        configService,
        'CS_ENUMERATION_CHAT_THRESHOLD',
        DEFAULT_ENUMERATION_CHAT_THRESHOLD,
      ),
      maxActiveBookingsPerPhone: readPositiveInteger(
        configService,
        'CS_MAX_ACTIVE_BOOKINGS_PER_PHONE',
        DEFAULT_MAX_ACTIVE_BOOKINGS_PER_PHONE,
      ),
      maxDraftBookingsPerDay: readPositiveInteger(
        configService,
        'CS_MAX_DRAFT_BOOKINGS_PER_DAY',
        DEFAULT_MAX_DRAFT_BOOKINGS_PER_DAY,
      ),
    },
  };
}
