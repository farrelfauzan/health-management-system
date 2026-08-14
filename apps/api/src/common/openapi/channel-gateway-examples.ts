/**
 * Response examples for the channel gateway's operational surface
 * (`PCS-T09`, §8.4).
 *
 * The device id is a fictional Indonesian mobile number. No example carries a
 * real JID, a real pairing link, or a bridge credential — the QR link below is
 * a private-network host name precisely because that is what a real one is.
 */
export const CHANNEL_GATEWAY_EXAMPLES = {
  sessionHealth: {
    kind: 'GOWA',
    isConfigured: true,
    isConnected: true,
    isLoggedIn: true,
    checkedAt: '2026-08-09T03:12:00.000Z',
  },
  pairingSession: {
    qrLink: 'http://gowa:3000/statics/qrcode/scan-qr-628123456789.png',
    expiresInSeconds: 60,
  },
  /**
   * A healthy registration. The host is a documentation domain, and neither
   * the bot token nor the webhook secret has a field to appear in.
   *
   * `lastErrorMessage` is populated deliberately rather than left null: a
   * remembered error alongside `isLastErrorStale: true` is the *normal* steady
   * state for any deployment that has ever had a bad minute, and an example
   * showing only nulls would teach a reader that any error means an outage.
   */
  telegramWebhookHealth: {
    isConfigured: true,
    isChannelEnabled: true,
    registeredUrl: 'https://klinik.example.id/api/v1/channels/telegram/webhook',
    expectedUrl: 'https://klinik.example.id/api/v1/channels/telegram/webhook',
    isMatching: true,
    pendingUpdateCount: 0,
    lastErrorAt: '2026-08-09T02:41:00.000Z',
    lastErrorMessage: 'Wrong response from the webhook: 401 Unauthorized',
    isLastErrorStale: true,
    checkedAt: '2026-08-09T03:12:00.000Z',
  },
} as const;
