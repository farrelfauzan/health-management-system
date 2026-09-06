const TYPE_SUMMARY_EXAMPLE = {
  id: 'c0a8012e-1b4f-4c7a-9d2e-3f5a6b7c8d90',
  code: 'AGREEMENT_PATIENT_CLINIC',
  name: 'Perjanjian pasien–klinik',
  behavior: 'GENERIC',
  contentMode: 'EITHER',
};

const DRAFTED_BY_EXAMPLE = {
  id: '4e1f9f0a-9a3f-4b58-b6b3-8d2f5a6c7e91',
  email: 'admin@klinik.example',
};

const DOCUMENT_VIEW_EXAMPLE = {
  id: 'e2c3d4f5-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  type: TYPE_SUMMARY_EXAMPLE,
  status: 'DRAFT',
  title: 'Perjanjian tanggung jawab biaya — Rina Wulandari',
  documentNumber: 'AGR/2026/0007',
  hasContentHtml: true,
  storageKey: null,
  storageMimeType: null,
  storageSizeBytes: null,
  patient: { id: '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c', fullName: 'Rina Wulandari' },
  doctor: null,
  subject: null,
  draftedBy: DRAFTED_BY_EXAMPLE,
  issuedAt: null,
  createdAt: '2026-09-30T02:00:00.000Z',
  updatedAt: '2026-09-30T02:05:00.000Z',
};

/**
 * Canonical examples for the documents registry (`P16-T28`), mirrored by
 * `ApiEndpoint` into the OpenAPI document. The list example carries no body
 * and the detail example a sanitised one; neither carries a storage key.
 */
export const MANAGED_DOCUMENT_EXAMPLES = {
  view: DOCUMENT_VIEW_EXAMPLE,
  detailView: {
    ...DOCUMENT_VIEW_EXAMPLE,
    contentHtml:
      '<h1>Perjanjian</h1><p>Pasien menyatakan bertanggung jawab atas biaya perawatan.</p>',
  },
  list: {
    items: [DOCUMENT_VIEW_EXAMPLE],
    meta: { page: 1, limit: 25, total: 1 },
  },
  createRequest: {
    typeId: TYPE_SUMMARY_EXAMPLE.id,
    title: 'Perjanjian tanggung jawab biaya — Rina Wulandari',
    documentNumber: 'AGR/2026/0007',
    contentHtml:
      '<h1>Perjanjian</h1><p>Pasien menyatakan bertanggung jawab atas biaya perawatan.</p>',
    patientId: '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c',
  },
  updateRequest: {
    title: 'Perjanjian tanggung jawab biaya — Rina Wulandari (rev. 2)',
    contentHtml:
      '<h1>Perjanjian</h1><p>Pasal 1. Pasien bertanggung jawab atas biaya perawatan.</p>',
  },
  uploadUrlRequest: { mimeType: 'application/pdf', sizeBytes: 184320 },
  uploadUrl: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf?X-Amz-Signature=...',
    storageKey: 'documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
    expiresAt: '2026-09-30T02:05:00.000Z',
    requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '184320' },
  },
  download: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf?X-Amz-Signature=...&response-content-disposition=attachment',
    expiresAt: '2026-09-30T02:10:00.000Z',
  },
  history: {
    documentId: DOCUMENT_VIEW_EXAMPLE.id,
    createdAt: '2026-09-30T02:00:00.000Z',
    updatedAt: '2026-09-30T02:05:00.000Z',
    issuedAt: null,
    entries: [
      {
        id: '0f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
        action: 'CREATE',
        actor: DRAFTED_BY_EXAMPLE,
        metadata: { typeCode: 'AGREEMENT_PATIENT_CLINIC', contentKind: 'DRAFTED' },
        occurredAt: '2026-09-30T02:00:00.000Z',
      },
      {
        id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        action: 'UPDATE',
        actor: DRAFTED_BY_EXAMPLE,
        metadata: { changedFields: ['contentHtml', 'title'] },
        occurredAt: '2026-09-30T02:05:00.000Z',
      },
    ],
  },
};
