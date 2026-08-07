import { z } from 'zod';

/**
 * The messaging channels the customer-service gateway speaks. Mirrors the
 * Prisma `ChannelKind` enum.
 *
 * `TELEGRAM` ships first as the pilot (D-CS-05): free, official, and no ban
 * risk, so every conversational flow can be exercised end to end before a real
 * WhatsApp number is exposed.
 */
export const CHANNEL_KINDS = ['WHATSAPP', 'TELEGRAM'] as const;

export const channelKindSchema = z.enum(CHANNEL_KINDS);

export type ChannelKindValue = z.infer<typeof channelKindSchema>;

/**
 * The longest inbound message body the gateway will carry.
 *
 * Telegram caps a text message at 4096 characters, so anything longer is not a
 * message this channel could have produced. The cap is enforced here rather
 * than trusted from the wire because the body is attacker-controlled and every
 * downstream consumer — dedup rows, transcripts, and eventually a prompt —
 * pays for its length.
 */
export const INBOUND_MESSAGE_MAX_LENGTH = 4096;

/**
 * The slice of a Telegram `Update` this gateway accepts.
 *
 * **Deliberately not the full Bot API type.** grammY ships complete typings,
 * and using them here would mean every field Telegram has ever added is in
 * scope for a webhook that only ever reads five of them. Parsing to a narrow
 * shape at the edge is what keeps "the gateway is a dumb pipe" true of the
 * data as well as the code: an update carrying a photo, a poll, an inline
 * query, or an edited message fails this schema and is acknowledged and
 * dropped rather than half-understood.
 *
 * `passthrough` is **not** used, so unknown keys are stripped rather than
 * carried forward into anything that persists them.
 */
export const telegramMessageSenderSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export type TelegramMessageSenderInput = z.infer<typeof telegramMessageSenderSchema>;

export const telegramWebhookUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      date: z.number().int(),
      chat: z.object({
        id: z.number().int(),
        // Group and channel chats are out of scope for v1: the conversation
        // model is one customer per chat, and a group would attribute several
        // people's messages to one conversation.
        type: z.string(),
      }),
      from: telegramMessageSenderSchema.optional(),
      text: z.string().optional(),
    })
    .optional(),
});

export type TelegramWebhookUpdateInput = z.infer<typeof telegramWebhookUpdateSchema>;

/**
 * Where a conversation is in its lifecycle (strategy §4.2). Mirrors the
 * Prisma `ConversationState` enum.
 *
 * The set exists to answer one question on every inbound message: **may the
 * LLM see this?** Only `BOT_ACTIVE` says yes.
 */
export const CONVERSATION_STATES = [
  'BOT_ACTIVE',
  'NEEDS_HUMAN',
  'HUMAN_ACTIVE',
  'AWAITING_OTP',
  'ARCHIVED',
] as const;

export const conversationStateSchema = z.enum(CONVERSATION_STATES);

export type ConversationStateValue = z.infer<typeof conversationStateSchema>;

/**
 * The states in which an inbound message is persisted but **never sent to a
 * provider**. Derived from the list rather than written as a branch, so a
 * state added later must be classified deliberately instead of defaulting
 * into the half that reaches the model.
 */
export const LLM_PAUSED_CONVERSATION_STATES = [
  'NEEDS_HUMAN',
  'HUMAN_ACTIVE',
  'AWAITING_OTP',
  'ARCHIVED',
] as const satisfies readonly ConversationStateValue[];

export const CONVERSATION_MESSAGE_ROLES = ['CUSTOMER', 'BOT', 'ADMIN', 'SYSTEM'] as const;

export const conversationMessageRoleSchema = z.enum(CONVERSATION_MESSAGE_ROLES);

export type ConversationMessageRoleValue = z.infer<typeof conversationMessageRoleSchema>;

/**
 * What a guard did to a turn, recorded on the persisted row so the §8.4
 * review can count what was actually caught rather than trusting it was
 * never needed.
 */
export const CS_SAFETY_TAGS = [
  'sensitive_data_redacted',
  'prompt_injection_blocked',
  'emergency_escalation',
  'medical_question_referred',
  'handoff_requested',
  'rate_limited',
  'provider_unavailable',
] as const;

export type CsSafetyTagValue = (typeof CS_SAFETY_TAGS)[number];
