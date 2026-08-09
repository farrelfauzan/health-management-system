import {
  GOWA_MESSAGE_EVENT,
  GowaWebhookEventInput,
  extractPhoneNumberFromJid,
  INBOUND_MESSAGE_MAX_LENGTH,
  InboundChannelMessage,
  WHATSAPP_USER_JID_SUFFIX,
} from '@hms/shared-types';

/**
 * Reduces one GOWA webhook event to the channel-blind
 * {@link InboundChannelMessage}, or `null` when it is not a message this
 * channel handles.
 *
 * The sibling of `normalizeTelegramUpdate`, and deliberately the same shape: a
 * pure function depending on nothing, so every branch is reachable from a unit
 * test with no Nest, no database, and no network. Normalization is the one
 * place a hostile body meets this codebase, and that is exactly where a
 * dependency would be most expensive.
 *
 * **Returning `null` is the common case.** GOWA publishes message, receipt,
 * presence, group, and connection events through one URL, and v1 answers one
 * of them. Five rejections are worth naming:
 *
 * - **Any event but `message`.** A read receipt is not something to reply to.
 * - **`is_from_me`.** GOWA echoes the clinic's *own* outbound messages back
 *   through the same webhook. Without this the bot answers itself, and two
 *   automated turns is an infinite loop with a banned number at the end of it.
 * - **Group chats.** A `@g.us` chat id would attribute several people's
 *   messages to one conversation and then reply to all of them — the same
 *   rejection the Telegram normalizer makes on `chat.type`.
 * - **Empty or whitespace-only bodies.** A media message arrives as a
 *   `message` event with no `body`; there is nothing to classify, and an empty
 *   string would still occupy a dedup row and a transcript turn. Unlike
 *   Telegram there is no shared-contact exception, because WhatsApp proves
 *   possession through the sender's own JID (§5.1.1 tier 1) rather than
 *   through a card.
 * - **Bodies past {@link INBOUND_MESSAGE_MAX_LENGTH}.**
 */
export function normalizeGowaWebhook(event: GowaWebhookEventInput): InboundChannelMessage | null {
  if (event.event !== GOWA_MESSAGE_EVENT) {
    return null;
  }
  const payload = event.payload;
  if (payload === undefined || payload.is_from_me === true) {
    return null;
  }
  if (!payload.chat_id.endsWith(WHATSAPP_USER_JID_SUFFIX)) {
    return null;
  }
  const text = payload.body?.trim() ?? '';
  if (text === '' || text.length > INBOUND_MESSAGE_MAX_LENGTH) {
    return null;
  }
  const senderJid = (payload.from ?? payload.chat_id).trim();
  if (senderJid === '') {
    return null;
  }
  return {
    channel: 'WHATSAPP',
    // The chat JID, not the sender's. On a one-to-one chat they are the same
    // number, but they are different *fields* — and the conversation is keyed
    // on where a reply has to go, which is the chat.
    externalChatId: payload.chat_id,
    externalMessageId: payload.id,
    senderDisplayName: buildDisplayName(payload.from_name),
    text,
    receivedAt: parseTimestamp(payload.timestamp),
    // §5.1.1 tier 1: on WhatsApp the sender identity *is* a phone number, and
    // WhatsApp has already verified that this device owns it. Carried as a
    // self-shared contact so the verification flow reads one shape on both
    // channels — the Telegram card and this JID are the same claim with the
    // same proof behind it, and giving them two shapes would put the tier
    // logic in two places.
    sharedContact: {
      phoneNumber: extractPhoneNumberFromJid(senderJid),
      isSelfShared: true,
    },
  };
}

/**
 * GOWA's RFC 3339 timestamp, or now.
 *
 * The channel's own clock is preferred over arrival time so a bridge that
 * buffered during an outage does not reorder a conversation on delivery — but
 * an unparseable value must not produce an `Invalid Date` that reaches the
 * database as a null and sorts a transcript at the epoch.
 */
function parseTimestamp(timestamp: string | undefined): string {
  if (timestamp === undefined) {
    return new Date().toISOString();
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

/**
 * A human-readable name if the bridge offered one. Never treated as identity:
 * a WhatsApp push name is chosen by the sender. It exists so an admin reading
 * the handoff queue sees something other than a number.
 */
function buildDisplayName(fromName: string | undefined): string | null {
  const trimmed = fromName?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
