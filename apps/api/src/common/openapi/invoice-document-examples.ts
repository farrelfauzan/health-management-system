import { optionalExample } from './api-endpoint.decorator';

const READY_DOCUMENT_VIEW = {
  id: 'b9a4f5f0-4a51-4c37-9f6e-8f5b7a2f0d43',
  invoiceId: '3f9d18e2-6b1a-4a53-a51e-70c9b9c7d8a1',
  status: 'READY',
  templateVersionId: optionalExample('9c2b8a10-3d41-45d0-8e4d-6bb1f3a7c552'),
  hasVoidWatermark: false,
  wasBoundRetroactively: false,
  checksum: optionalExample('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'),
  sizeBytes: optionalExample(48213),
  pageCount: optionalExample(1),
  warnings: [
    {
      token: 'invoice.qrVerify',
      reason: 'No value is recorded for this field',
    },
  ],
  renderError: optionalExample('PDF renderer is unreachable'),
  renderedAt: optionalExample('2026-09-01T07:05:12.000Z'),
  createdAt: '2026-09-01T07:05:00.000Z',
  updatedAt: '2026-09-01T07:05:12.000Z',
};

/**
 * Canonical examples for the invoice-document surface (`P16-T06`), mirrored
 * by `ApiEndpoint` into the OpenAPI document.
 */
export const INVOICE_DOCUMENT_EXAMPLES = {
  readyView: READY_DOCUMENT_VIEW,
  download: {
    url: 'https://storage.example/invoices/documents/6f7f0c9a-1f2e-4d16-8b58-2f4a0e63b7aa.pdf?X-Amz-Signature=…',
    fileName: 'INV-20260901-0007.pdf',
    expiresAt: '2026-09-01T07:15:00.000Z',
  },
} as const;
