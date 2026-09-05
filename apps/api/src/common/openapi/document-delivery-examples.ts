/**
 * Canonical examples for the delivery-consent endpoints (P16-T24), mirrored
 * by `ApiEndpoint` into the OpenAPI document.
 */
const GRANTED_WHATSAPP_CONSENT = {
  channel: 'WHATSAPP',
  isGranted: true,
  noticeVersion: { id: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9', version: '1.0' },
  grantedAt: '2026-09-28T02:15:00.000Z',
  grantedBy: { id: '0f4b6f2a-5d7e-4c1b-9a3e-2b8c7d6e5f40', email: 'kasir@klinik.example' },
  revokedAt: null,
  revokedReason: null,
};

export const DOCUMENT_DELIVERY_EXAMPLES = {
  consents: {
    patientId: '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c',
    channels: [
      {
        channel: 'WHATSAPP',
        consent: GRANTED_WHATSAPP_CONSENT,
        isDeliveryAllowed: false,
        refusalReason: 'NUMBER_UNVERIFIED',
      },
      {
        channel: 'EMAIL',
        consent: null,
        isDeliveryAllowed: false,
        refusalReason: 'CONSENT_MISSING',
      },
    ],
  },
  upsertRequest: {
    channel: 'WHATSAPP',
    isGranted: true,
  },
} as const;
