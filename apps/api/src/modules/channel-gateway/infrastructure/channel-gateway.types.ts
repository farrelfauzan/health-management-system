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

/**
 * One file, sent as a WhatsApp document message (`P16-T22`, PRD §7.4.1).
 *
 * The bytes travel in the request rather than a URL for the bridge to fetch:
 * an invoice PDF or a released clinical file lives behind a signed, short-lived
 * object-store URL that the bridge container has no business resolving, and a
 * URL a bridge fetches is a URL that ends up in its logs.
 */
export type SendChannelDocumentRequest = {
  /** Telegram chat id or WhatsApp JID, as a string on both channels. */
  externalChatId: string;
  fileName: string;
  mimeType: string;
  content: Uint8Array;
  /**
   * Text shown with the document.
   *
   * Never carries clinical content (FR-E4-15/27): a caption is rendered in the
   * chat list and in notifications, where anyone holding the phone reads it.
   * The callers enforce that rule; the type documents it.
   */
  caption?: string;
};
