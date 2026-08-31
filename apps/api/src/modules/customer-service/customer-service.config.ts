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

/**
 * How long an unresolved prospective patient is kept, in days (`P17-T01`,
 * design §6).
 *
 * **Not an RME retention period.** The row is a booking enquiry holding a name
 * and a phone number for somebody who was never a patient, so PMK 24/2022's
 * twenty-five years does not apply to it and applying it would be the mistake
 * the whole table exists to undo. UU PDP 27/2022 governs instead, and ninety
 * days is what that asks for: long enough for a booking made well ahead and a
 * customer who reschedules twice, short enough that the clinic is not holding
 * a list of strangers' phone numbers indefinitely.
 */
const DEFAULT_PROSPECTIVE_PATIENT_RETENTION_DAYS = 90;

/**
 * Once a day. Retention is measured in days, so sweeping more often just
 * queries the same nothing; the knob exists for tests and for an operator
 * draining a backlog, not as a tuning dial.
 */
const DEFAULT_PROSPECTIVE_EXPIRY_POLL_INTERVAL_MS = 24 * 60 * 60 * 1_000;

/**
 * Records purged per sweep. Bounded so a first run against a long backlog
 * cannot hold one transaction open over thousands of rows; the next interval
 * takes the remainder.
 */
const DEFAULT_PROSPECTIVE_EXPIRY_BATCH_LIMIT = 200;

function readBooleanFlag(configService: ConfigService, key: string, fallback: boolean): boolean {
  const rawValue = configService.get<string>(key)?.trim();
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  if (rawValue !== 'true' && rawValue !== 'false') {
    throw new Error(`Customer-service configuration error: ${key} must be "true" or "false"`);
  }
  return rawValue === 'true';
}

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
      prospectivePatientRetentionDays: readPositiveInteger(
        configService,
        'CS_PROSPECTIVE_PATIENT_RETENTION_DAYS',
        DEFAULT_PROSPECTIVE_PATIENT_RETENTION_DAYS,
      ),
    },
    prospectiveExpiry: {
      // Defaults on, unlike most worker flags: not sweeping is the compliance
      // failure this job exists to prevent, so switching it off has to be the
      // deliberate act rather than forgetting to switch it on.
      workerEnabled: readBooleanFlag(configService, 'CS_PROSPECTIVE_EXPIRY_WORKER_ENABLED', true),
      workerPollIntervalMs: readPositiveInteger(
        configService,
        'CS_PROSPECTIVE_EXPIRY_WORKER_POLL_INTERVAL_MS',
        DEFAULT_PROSPECTIVE_EXPIRY_POLL_INTERVAL_MS,
      ),
      workerBatchLimit: readPositiveInteger(
        configService,
        'CS_PROSPECTIVE_EXPIRY_WORKER_BATCH_LIMIT',
        DEFAULT_PROSPECTIVE_EXPIRY_BATCH_LIMIT,
      ),
    },
  };
}
