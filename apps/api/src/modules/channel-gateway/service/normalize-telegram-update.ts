import {
  INBOUND_MESSAGE_MAX_LENGTH,
  InboundChannelMessage,
  SharedContact,
  TelegramContactInput,
  TelegramMessageSenderInput,
  TelegramWebhookUpdateInput,
} from '@hms/shared-types';

/** Telegram's own name for a one-to-one chat. Groups are out of scope in v1. */
const PRIVATE_CHAT_TYPE = 'private';

/**
 * Reduces one Telegram `Update` to the channel-blind
 * {@link InboundChannelMessage}, or `null` when it is not a message this
 * channel handles.
 *
 * **Returning `null` is the common case, not the error case.** Telegram
 * delivers edits, joins, leaves, photos, stickers, polls, and service
 * messages through the same webhook, and v1 answers text in private chats.
 * Everything else is acknowledged and dropped: a webhook that 4xx'd on a
 * sticker would make Telegram retry that sticker forever.
 *
 * A pure function rather than a service method, deliberately. Normalization is
 * the one place a malformed or hostile update meets this codebase, and having
 * it depend on nothing means every branch is reachable from a unit test with
 * no Nest, no database, and no network.
 *
 * Four rejections are worth naming:
 *
 * - **Non-private chats.** The conversation model is one customer per chat,
 *   and a group would attribute several people's messages to one conversation
 *   — and then reply to all of them.
 * - **Bots.** A bot-to-bot loop is two automated systems answering each other
 *   indefinitely, and the customer-facing cost of that is a rate limit and a
 *   banned number.
 * - **Empty or whitespace-only text.** There is nothing to classify, and an
 *   empty string would still occupy a dedup row and a transcript turn. The one
 *   exception is a shared contact card, which is an *action* rather than an
 *   utterance and carries no text by design (§5.1.1 tier 2).
 * - **Text past {@link INBOUND_MESSAGE_MAX_LENGTH}.** Telegram cannot itself
 *   produce one, so anything longer did not come from the client it claims to.
 */
export function normalizeTelegramUpdate(
  update: TelegramWebhookUpdateInput,
): InboundChannelMessage | null {
  const message = update.message;
  if (message === undefined || message.chat.type !== PRIVATE_CHAT_TYPE) {
    return null;
  }
  if (message.from?.is_bot === true) {
    return null;
  }
  const text = message.text?.trim() ?? '';
  const sharedContact = buildSharedContact(message.contact, message.from);
  if (text.length > INBOUND_MESSAGE_MAX_LENGTH) {
    return null;
  }
  if (text === '' && sharedContact === undefined) {
    return null;
  }
  return {
    channel: 'TELEGRAM',
    externalChatId: String(message.chat.id),
    // Per-chat rather than per-bot, which is why the dedup constraint carries
    // the chat id alongside it.
    externalMessageId: String(message.message_id),
    senderDisplayName: buildDisplayName(message.from),
    text,
    // Telegram sends whole seconds since the epoch; the channel's own clock
    // is used rather than arrival time so a gateway that buffered during an
    // outage does not reorder a conversation on delivery.
    receivedAt: new Date(message.date * 1000).toISOString(),
    ...(sharedContact === undefined ? {} : { sharedContact }),
  };
}

/**
 * Reduces a Telegram contact card to the two facts verification needs: the
 * number, and whether it is the sender's own.
 *
 * **`isSelfShared` is the whole point.** A customer can share any contact from
 * their address book, and the wire shape is identical — same field, same
 * `phone_number`. Only a card whose `user_id` is the sender's own account is
 * evidence that this person holds that number, because that is the card
 * Telegram fills in itself when the `request_contact` button is tapped. Every
 * other card is data the sender chose, which is exactly what a phone number
 * typed into the chat already was.
 */
function buildSharedContact(
  contact: TelegramContactInput | undefined,
  from: TelegramMessageSenderInput | undefined,
): SharedContact | undefined {
  if (contact === undefined) {
    return undefined;
  }
  const phoneNumber = contact.phone_number.trim();
  if (phoneNumber === '') {
    return undefined;
  }
  return {
    phoneNumber,
    isSelfShared: from !== undefined && contact.user_id === from.id,
  };
}

/**
 * A human-readable name if Telegram offered one. Never treated as identity —
 * every part of it is chosen by its owner — so it exists only so an admin
 * reading a handoff queue sees something other than a chat id.
 */
function buildDisplayName(from: TelegramMessageSenderInput | undefined): string | null {
  if (from === undefined) {
    return null;
  }
  const fullName = [from.first_name, from.last_name]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .join(' ')
    .trim();
  if (fullName !== '') {
    return fullName;
  }
  return from.username === undefined || from.username.trim() === '' ? null : from.username.trim();
}
