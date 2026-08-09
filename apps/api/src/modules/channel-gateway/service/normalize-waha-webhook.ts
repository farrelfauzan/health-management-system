import {
  extractPhoneNumberFromJid,
  INBOUND_MESSAGE_MAX_LENGTH,
  InboundChannelMessage,
  toCanonicalWhatsappJid,
  WhatsappWebhookEventInput,
} from '@hms/shared-types';

/** WAHA's event name for an inbound message. Everything else is dropped. */
const WAHA_MESSAGE_EVENT = 'message';

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Reduces one WAHA webhook event to the channel-blind
 * {@link InboundChannelMessage}, or `null` when it is not a message this
 * channel handles (`PCS-T10`).
 *
 * The third of these functions — Telegram, GOWA, now WAHA — and deliberately
 * the same shape as the other two: a pure function depending on nothing, so
 * every branch is reachable from a unit test with no Nest, no database, and no
 * network. It produces exactly the same output type as `normalizeGowaWebhook`
 * for the same conversation, which is the property the contract suite asserts
 * and the property D-CS-01's "swap is config, not redesign" claim rests on.
 *
 * **Three differences from GOWA are where a copy-paste would go wrong**, and
 * all three are silent failures rather than loud ones:
 *
 * - `fromMe`, not `is_from_me`. Read the wrong key and it is always
 *   `undefined`, so the clinic's own echoed replies stop being filtered and
 *   the bot answers itself in a loop.
 * - `from` is the chat, and there is no separate `chat_id`. WAHA puts the
 *   room in `from` for a group, which is why the group check runs on the same
 *   field.
 * - `timestamp` is **Unix seconds**, not RFC 3339. Passed to `Date.parse` it
 *   is `NaN`; passed to `new Date()` unmultiplied it is 1970, which sorts a
 *   transcript backwards without erroring anywhere.
 */
export function normalizeWahaWebhook(
  event: WhatsappWebhookEventInput,
): InboundChannelMessage | null {
  if (event.event !== WAHA_MESSAGE_EVENT) {
    return null;
  }
  const payload = event.payload;
  if (payload === undefined || payload.fromMe === true) {
    return null;
  }
  // The wire schema is a permissive superset of both bridges, so the fields
  // *this* bridge requires are checked here rather than assumed.
  if (payload.id === undefined || payload.from === undefined) {
    return null;
  }
  const canonicalChatId = toCanonicalWhatsappJid(payload.from);
  if (canonicalChatId === null) {
    return null;
  }
  const text = payload.body?.trim() ?? '';
  if (text === '' || text.length > INBOUND_MESSAGE_MAX_LENGTH) {
    return null;
  }
  return {
    channel: 'WHATSAPP',
    externalChatId: canonicalChatId,
    externalMessageId: payload.id,
    // WAHA's message payload carries no push name at all — its own schema
    // documents the absence — so the handoff queue shows the number for a
    // WAHA-delivered conversation. Inventing one from the JID would put a
    // phone number in the column that exists to avoid showing one.
    senderDisplayName: null,
    text,
    receivedAt: parseTimestamp(payload.timestamp),
    // §5.1.1 tier 1, identical to the GOWA path: on WhatsApp the sender
    // identity *is* a number WhatsApp verified the device owns, and both
    // bridges deliver the same proof through a different field name.
    sharedContact: {
      phoneNumber: extractPhoneNumberFromJid(payload.from),
      isSelfShared: true,
    },
  };
}

/**
 * WAHA's Unix-seconds timestamp, or now.
 *
 * Guarded on both sides: a missing value and a non-finite one both fall back
 * to arrival time, because an `Invalid Date` here reaches the transcript as a
 * null and sorts the conversation at the epoch — a wrong order that nothing
 * downstream reports as an error.
 */
function parseTimestamp(timestamp: string | number | undefined): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return new Date().toISOString();
  }
  return new Date(timestamp * MILLISECONDS_PER_SECOND).toISOString();
}
