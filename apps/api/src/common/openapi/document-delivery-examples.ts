import { optionalExample } from './api-endpoint.decorator';

/**
 * Canonical examples for the delivery-consent endpoints (P16-T24) and the
 * send pipeline (P16-T25), mirrored by `ApiEndpoint` into the OpenAPI
 * document.
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

const INVOICE_ID = '4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const REQUESTED_BY = { id: '0f4b6f2a-5d7e-4c1b-9a3e-2b8c7d6e5f40', email: 'kasir@klinik.example' };

const QUEUED_DELIVERY = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  patientId: '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c',
  invoiceId: INVOICE_ID,
  documentId: null,
  channel: 'WHATSAPP',
  shape: 'ATTACHMENT',
  destinationMasked: '6281****0024',
  status: 'QUEUED',
  attemptCount: 0,
  sendAt: null,
  passwordSource: 'DOB_DDMMYYYY',
  lastError: null,
  sentAt: null,
  openedAt: null,
  revokedAt: null,
  requestedBy: REQUESTED_BY,
  link: null,
  createdAt: '2026-09-29T08:00:00.000Z',
  updatedAt: '2026-09-29T08:00:00.000Z',
};

const SENT_LINK_DELIVERY = {
  ...QUEUED_DELIVERY,
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  channel: 'EMAIL',
  shape: 'LINK',
  destinationMasked: 'r***@example.test',
  status: 'OPENED',
  attemptCount: 1,
  passwordSource: null,
  sentAt: '2026-09-29T08:00:12.000Z',
  openedAt: '2026-09-29T08:14:03.000Z',
  link: {
    expiresAt: '2026-10-06T08:00:12.000Z',
    revokedAt: null,
    openCount: 1,
    lastOpenedAt: '2026-09-29T08:14:03.000Z',
  },
  updatedAt: '2026-09-29T08:14:03.000Z',
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
  sendRequest: {
    channels: ['WHATSAPP', 'EMAIL'],
    shape: 'ATTACHMENT',
    sendAt: optionalExample('2026-10-02T09:00:00+07:00'),
  },
  timeline: {
    invoiceId: INVOICE_ID,
    deliveries: [QUEUED_DELIVERY, SENT_LINK_DELIVERY],
  },
  queuedDelivery: QUEUED_DELIVERY,
  revokedDelivery: {
    ...SENT_LINK_DELIVERY,
    status: 'REVOKED',
    revokedAt: '2026-09-29T09:12:00.000Z',
    link: { ...SENT_LINK_DELIVERY.link, revokedAt: '2026-09-29T09:12:00.000Z' },
  },
  cancelledDelivery: {
    ...QUEUED_DELIVERY,
    status: 'CANCELLED',
    sendAt: '2026-10-02T02:00:00.000Z',
    lastError: 'CANCELLED_BY_STAFF',
    revokedAt: '2026-09-29T09:12:00.000Z',
  },
  scheduledDelivery: { ...QUEUED_DELIVERY, sendAt: '2026-10-02T02:00:00.000Z' },
  rescheduleRequest: { sendAt: '2026-10-02T02:00:00+07:00' },
  linkResolution: {
    url: 'https://storage.example/invoices/…?X-Amz-Signature=…',
    fileName: 'INV-2026-09-000123.pdf',
    expiresAt: '2026-09-29T08:20:00.000Z',
  },
} as const;
