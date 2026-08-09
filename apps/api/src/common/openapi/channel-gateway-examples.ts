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
} as const;
