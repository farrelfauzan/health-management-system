import { ChannelKindValue } from '#customer-service/schemas';

/**
 * One inbound customer message, normalized off whichever wire it arrived on
 * (customer-service strategy §4.1).
 *
 * Everything downstream of the gateway is channel-blind, and this type is why.
 * A WhatsApp JID and a Telegram chat id are both `externalChatId`; a GOWA
 * webhook body and a Telegram `Update` both reduce to these six fields. The
 * conversation state machine, the tool loop, and the transcript never learn
 * which gateway delivered a message, which is what makes swapping WhatsApp
 * gateways — or adding the official Cloud API later — a change at the edge
 * rather than a change to business logic.
 */
export type InboundChannelMessage = {
  channel: ChannelKindValue;
  /** WhatsApp JID or Telegram chat id, as a string on both channels. */
  externalChatId: string;
  /**
   * The gateway's own id for this message, used for dedup.
   *
   * **Unique only within a chat, not globally**, on both channels: Telegram's
   * `message_id` counts up per conversation, so two customers trivially hold
   * the same one. The uniqueness constraint is therefore over
   * `(channel, externalChatId, externalMessageId)` — see the note on the
   * dedup table.
   */
  externalMessageId: string;
  /**
   * Whatever the channel offers as a human name, or null. Never trusted as
   * identity: a Telegram display name is chosen by its owner and a WhatsApp
   * push name is chosen by the sender. It exists so an admin reading a
   * handoff queue sees something other than a number.
   */
  senderDisplayName: string | null;
  text: string;
  /** ISO 8601, from the channel's own timestamp rather than arrival time. */
  receivedAt: string;
};

/**
 * One outbound reply. The dispatcher picks an adapter from `channel`, so a
 * caller composes a message without knowing which gateway will carry it.
 */
export type OutboundChannelMessage = {
  channel: ChannelKindValue;
  externalChatId: string;
  text: string;
};

/**
 * What the gateway did with an inbound message, returned to the webhook so the
 * acknowledgement body says something true.
 *
 * `DUPLICATE` is a success, not an error: gateways retry webhooks, and a retry
 * being recognised and dropped is the dedup layer working. The distinction is
 * kept because the two have very different meanings in a log — a rising
 * `ACCEPTED` count is traffic, a rising `DUPLICATE` count is a gateway that
 * is not receiving our acknowledgements.
 */
export const INBOUND_MESSAGE_OUTCOMES = ['ACCEPTED', 'DUPLICATE', 'IGNORED', 'DISABLED'] as const;

export type InboundMessageOutcomeValue = (typeof INBOUND_MESSAGE_OUTCOMES)[number];

/** Gateway configuration resolved at startup (strategy §8.5). */
export type ChannelGatewayConfig = {
  /** Master switch, default off. With it off, no webhook does any work. */
  readonly isEnabled: boolean;
  readonly telegram: {
    readonly botToken: string;
    /**
     * The value Telegram echoes in `X-Telegram-Bot-Api-Secret-Token`. Empty
     * means the Telegram channel is not configured, and its webhook refuses
     * every request rather than accepting unauthenticated ones.
     */
    readonly webhookSecret: string;
  };
};
