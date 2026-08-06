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
};
