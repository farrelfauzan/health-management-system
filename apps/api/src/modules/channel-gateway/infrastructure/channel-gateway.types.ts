/**
 * Wire-facing types for the channel gateway.
 *
 * These stay in the API rather than moving to `@hms/shared-types` (strategy
 * §4.1): they describe how this process talks to GOWA, WAHA, and the Telegram
 * Bot API, and no frontend or shared consumer has any business knowing which
 * gateway is in use. The *normalized* shapes — `InboundChannelMessage`,
 * `OutboundChannelMessage` — are the ones that are shared, because they are
 * the ones downstream code depends on.
 */
export type SendChannelTextRequest = {
  /** Telegram chat id or WhatsApp JID, as a string on both channels. */
  externalChatId: string;
  text: string;
  /**
   * Ask for the sender's own contact card with this message (§5.1.1 tier 2).
   *
   * A hint the adapter is free to ignore: Telegram renders a one-tap button,
   * and a gateway with no equivalent affordance sends the text alone. The
   * conversation core stays text-first precisely so that degradation is
   * automatic rather than a second code path (§7).
   */
  requestContact?: boolean;
};
