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
