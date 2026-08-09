import { ConfigService } from '@nestjs/config';

import { CustomerServiceConfig } from '@hms/shared-types';

const DEFAULT_HISTORY_TURN_LIMIT = 20;
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
