import { optionalExample } from './api-endpoint.decorator';

const TEMPLATE_SETTINGS_EXAMPLE = {
  paperSize: 'A4',
  orientation: 'PORTRAIT',
  marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
  itemsColumns: ['item.no', 'item.description', 'item.quantity', 'item.unitPrice', 'item.amount'],
};

const TEMPLATE_VIEW_EXAMPLE = {
  id: '0d9e2f34-6f3a-4c9e-9b1e-2a45b1c0d217',
  kind: 'INVOICE',
  name: 'Kuitansi A5',
  description: optionalExample('Layout kuitansi setengah halaman untuk kasir'),
  status: 'PUBLISHED',
  isDefault: true,
  contentHtml:
    '<div><h1><span data-hms-var="clinic.name"></span></h1><p>No. <span data-hms-var="invoice.number"></span></p><div data-hms-var="items"></div></div>',
  settings: TEMPLATE_SETTINGS_EXAMPLE,
  latestPublishedVersion: optionalExample({
    id: '9c2b8a10-3d41-45d0-8e4d-6bb1f3a7c552',
    versionNumber: 3,
    publishedAt: '2026-09-01T04:20:00.000Z',
    publishedById: optionalExample('4e1f9f0a-9a3f-4b58-b6b3-8d2f5a6c7e91'),
  }),
  createdAt: '2026-08-30T08:00:00.000Z',
  updatedAt: '2026-09-01T04:20:00.000Z',
};

/**
 * Canonical examples for the document-template CRUD surface (`P16-T05`),
 * mirrored by `ApiEndpoint` into the OpenAPI document.
 */
export const DOCUMENT_TEMPLATE_EXAMPLES = {
  settings: TEMPLATE_SETTINGS_EXAMPLE,
  view: TEMPLATE_VIEW_EXAMPLE,
  draftView: {
    id: '5b7c1a02-88d4-4f0f-bb0e-9f2ad4e6a913',
    kind: 'INVOICE',
    name: 'Faktur percobaan',
    description: optionalExample('Draf baru yang belum diterbitkan'),
    status: 'DRAFT',
    isDefault: false,
    contentHtml: '<div><h1><span data-hms-var="clinic.name"></span></h1></div>',
    settings: TEMPLATE_SETTINGS_EXAMPLE,
    createdAt: '2026-09-01T04:00:00.000Z',
    updatedAt: '2026-09-01T04:00:00.000Z',
  },
  createRequest: {
    kind: 'INVOICE',
    name: 'Kuitansi A5',
    description: 'Layout kuitansi setengah halaman untuk kasir',
    contentHtml: '<div><h1><span data-hms-var="clinic.name"></span></h1></div>',
    settings: TEMPLATE_SETTINGS_EXAMPLE,
  },
  updateRequest: {
    name: 'Kuitansi A5 (revisi)',
    contentHtml:
      '<div><h1><span data-hms-var="clinic.name"></span></h1><p><span data-hms-var="patient.fullName"></span></p></div>',
  },
  archivedView: {
    id: '5b7c1a02-88d4-4f0f-bb0e-9f2ad4e6a913',
    archivedAt: '2026-09-01T05:00:00.000Z',
  },
  previewView: {
    url: 'https://objects.example/document-templates/previews/3f1c…/preview.pdf?X-Amz-Signature=…',
    expiresAt: '2026-09-01T05:05:00.000Z',
    warnings: [
      {
        token: 'clinic.logo',
        reason: 'The fixture carries no clinic logo',
      },
    ],
  },
} as const;
