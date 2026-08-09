import { InboundChannelMessage, WhatsappWebhookEventInput } from '@hms/shared-types';

/**
 * The fixture conversations every WhatsApp bridge must agree on (`PCS-T10`).
 *
 * D-CS-01's promise is that switching bridges is configuration rather than a
 * redesign. That promise is only worth something if the two implementations
 * genuinely behave the same, and "genuinely the same" is not a thing a reader
 * can check by comparing two adapter files — they *look* different, because
 * the wire formats are different. So it is asserted instead: one table of
 * cases, run through both adapters by `whatsapp-gateway-contract.spec.ts`.
 *
 * The cases are described by **what the customer did**, not by what either
 * bridge sends, and each carries the two bodies that represent it. A third
 * adapter — the Cloud API endgame — adds a column here and inherits every
 * assertion rather than needing a suite written for it.
 */
export type InboundContractCase = {
  /** What happened, in the customer's terms. */
  readonly description: string;
  readonly gowaBody: WhatsappWebhookEventInput;
  readonly wahaBody: WhatsappWebhookEventInput;
  /**
   * The one normalized message both bridges must produce, or `null` when both
   * must drop the event.
   *
   * `receivedAt` is deliberately absent from the comparison: the two bridges
   * carry the clock differently (RFC 3339 against Unix seconds) and a fixture
   * that pinned it would be asserting the fixture rather than the parity.
   * `whatsapp-gateway-contract.spec.ts` checks it is a valid instant
   * separately.
   */
  readonly expected: Omit<InboundChannelMessage, 'receivedAt'> | null;
};

const CUSTOMER_NUMBER = '628123456789';
const CANONICAL_CHAT_ID = `${CUSTOMER_NUMBER}@s.whatsapp.net`;
const MESSAGE_ID = '3EB0C127D7BACC83D6A1';
const SESSION_TIMESTAMP_ISO = '2026-08-09T03:12:00Z';
const SESSION_TIMESTAMP_UNIX = Math.floor(Date.parse(SESSION_TIMESTAMP_ISO) / 1000);

function buildGowaBody(
  payload: Record<string, unknown>,
  event = 'message',
): WhatsappWebhookEventInput {
  return {
    event,
    device_id: '628111000111@s.whatsapp.net',
    payload: {
      id: MESSAGE_ID,
      chat_id: `${CUSTOMER_NUMBER}@s.whatsapp.net`,
      from: `${CUSTOMER_NUMBER}@s.whatsapp.net`,
      timestamp: SESSION_TIMESTAMP_ISO,
      is_from_me: false,
      body: 'Klinik buka jam berapa?',
      ...payload,
    },
  } as WhatsappWebhookEventInput;
}

function buildWahaBody(
  payload: Record<string, unknown>,
  event = 'message',
): WhatsappWebhookEventInput {
  return {
    event,
    session: 'default',
    engine: 'NOWEB',
    payload: {
      id: MESSAGE_ID,
      from: `${CUSTOMER_NUMBER}@c.us`,
      to: '628111000111@c.us',
      timestamp: SESSION_TIMESTAMP_UNIX,
      fromMe: false,
      body: 'Klinik buka jam berapa?',
      ...payload,
    },
  } as WhatsappWebhookEventInput;
}

/**
 * `senderDisplayName` is the one field the two bridges cannot agree on, and
 * the disagreement is a fact about WAHA rather than a defect: its message
 * payload carries no push name at all, which its own published schema states.
 * The contract therefore asserts everything *except* this field across both,
 * and asserts the field per-bridge — pretending to parity here would mean
 * either inventing a name for WAHA or discarding one GOWA supplied.
 */
export const CONTRACT_IGNORED_FIELDS = ['senderDisplayName'] as const;

export const INBOUND_CONTRACT_CASES: readonly InboundContractCase[] = [
  {
    description: 'a customer asks a question in a one-to-one chat',
    gowaBody: buildGowaBody({}),
    wahaBody: buildWahaBody({}),
    expected: {
      channel: 'WHATSAPP',
      externalChatId: CANONICAL_CHAT_ID,
      externalMessageId: MESSAGE_ID,
      senderDisplayName: null,
      text: 'Klinik buka jam berapa?',
      sharedContact: { phoneNumber: CUSTOMER_NUMBER, isSelfShared: true },
    },
  },
  {
    description: 'the same customer messaging from a second linked device',
    gowaBody: buildGowaBody({
      chat_id: `${CUSTOMER_NUMBER}:12@s.whatsapp.net`,
      from: `${CUSTOMER_NUMBER}:12@s.whatsapp.net`,
    }),
    wahaBody: buildWahaBody({ from: `${CUSTOMER_NUMBER}:12@c.us` }),
    // The device suffix is stripped on both, so a customer who switches
    // phones stays in the same conversation rather than starting a new one.
    expected: {
      channel: 'WHATSAPP',
      externalChatId: CANONICAL_CHAT_ID,
      externalMessageId: MESSAGE_ID,
      senderDisplayName: null,
      text: 'Klinik buka jam berapa?',
      sharedContact: { phoneNumber: CUSTOMER_NUMBER, isSelfShared: true },
    },
  },
  {
    description: 'a message with surrounding whitespace',
    gowaBody: buildGowaBody({ body: '  Klinik buka jam berapa?  ' }),
    wahaBody: buildWahaBody({ body: '  Klinik buka jam berapa?  ' }),
    expected: {
      channel: 'WHATSAPP',
      externalChatId: CANONICAL_CHAT_ID,
      externalMessageId: MESSAGE_ID,
      senderDisplayName: null,
      text: 'Klinik buka jam berapa?',
      sharedContact: { phoneNumber: CUSTOMER_NUMBER, isSelfShared: true },
    },
  },
  {
    description: 'the clinic’s own reply echoed back by the bridge',
    // The single most important shared rejection: without it the bot answers
    // itself, in a loop, at pace, with a banned number at the end.
    gowaBody: buildGowaBody({ is_from_me: true }),
    wahaBody: buildWahaBody({ fromMe: true }),
    expected: null,
  },
  {
    description: 'a group chat',
    gowaBody: buildGowaBody({ chat_id: '120363000000000000@g.us' }),
    wahaBody: buildWahaBody({ from: '120363000000000000@g.us' }),
    expected: null,
  },
  {
    description: 'a status broadcast',
    gowaBody: buildGowaBody({ chat_id: 'status@broadcast' }),
    wahaBody: buildWahaBody({ from: 'status@broadcast' }),
    expected: null,
  },
  {
    description: 'a media message carrying no text',
    gowaBody: buildGowaBody({ body: undefined }),
    wahaBody: buildWahaBody({ body: undefined, hasMedia: true }),
    expected: null,
  },
  {
    description: 'a whitespace-only message',
    gowaBody: buildGowaBody({ body: '   ' }),
    wahaBody: buildWahaBody({ body: '   ' }),
    expected: null,
  },
  {
    description: 'a body longer than any WhatsApp client could produce',
    gowaBody: buildGowaBody({ body: 'a'.repeat(4097) }),
    wahaBody: buildWahaBody({ body: 'a'.repeat(4097) }),
    expected: null,
  },
  {
    description: 'a delivery receipt rather than a message',
    gowaBody: buildGowaBody({}, 'receipt'),
    wahaBody: buildWahaBody({}, 'message.ack'),
    expected: null,
  },
  {
    description: 'a message with no id',
    gowaBody: buildGowaBody({ id: undefined }),
    wahaBody: buildWahaBody({ id: undefined }),
    expected: null,
  },
];

/** The canonical chat id every outbound contract case addresses. */
export const CONTRACT_OUTBOUND_CHAT_ID = CANONICAL_CHAT_ID;

/** What each bridge must put on the wire for that one canonical id. */
export const OUTBOUND_WIRE_CHAT_IDS = {
  GOWA: `${CUSTOMER_NUMBER}@s.whatsapp.net`,
  WAHA: `${CUSTOMER_NUMBER}@c.us`,
} as const;
