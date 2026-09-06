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

const APPROVER_EXAMPLE = {
  id: '8c7d6e5f-4a3b-42c1-9d0e-7f6a5b4c3d2e',
  email: 'dr.sari@klinik.example',
  isEligible: true,
};

const APPROVAL_SUMMARY_EXAMPLE = {
  roundId: '5d4c3b2a-1f0e-49d8-a7b6-c5d4e3f2a1b0',
  status: 'PENDING',
  dueAt: '2026-10-03T10:00:00.000Z',
  isOverdue: false,
  submittedAt: '2026-09-30T02:10:00.000Z',
  approverCount: 2,
  approvalCount: 0,
  requiredApprovals: 1,
  hasNoEligibleApprover: false,
};

const APPROVAL_ROUND_EXAMPLE = {
  id: APPROVAL_SUMMARY_EXAMPLE.roundId,
  documentId: 'e2c3d4f5-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  status: 'PENDING',
  submittedBy: {
    id: '4e1f9f0a-9a3f-4b58-b6b3-8d2f5a6c7e91',
    email: 'admin@klinik.example',
  },
  submittedAt: '2026-09-30T02:10:00.000Z',
  dueAt: '2026-10-03T10:00:00.000Z',
  isOverdue: false,
  resolvedAt: null,
  approvers: [APPROVER_EXAMPLE],
  decisions: [],
  requiredApprovals: 1,
  approvalCount: 0,
  hasNoEligibleApprover: false,
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
  approval: null,
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
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    defaultApprovers: [DRAFTED_BY_EXAMPLE],
  },
  pendingDetailView: {
    ...DOCUMENT_VIEW_EXAMPLE,
    status: 'PENDING_APPROVAL',
    approval: APPROVAL_SUMMARY_EXAMPLE,
    contentHtml:
      '<h1>Perjanjian</h1><p>Pasien menyatakan bertanggung jawab atas biaya perawatan.</p>',
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    defaultApprovers: [DRAFTED_BY_EXAMPLE],
  },
  submitRequest: {
    approverIds: [APPROVER_EXAMPLE.id],
    dueAt: '2026-10-03T10:00:00.000Z',
  },
  rejectRequest: { reason: 'Pasal 4 bertentangan dengan kebijakan pengembalian dana klinik.' },
  bulkApproveRequest: {
    requestIds: [
      '2f8a6b1c-9d43-4a17-9c58-0b6e5f1a7d24',
      '7c1d0e93-4b2a-4f88-9a10-3d5c6b7e8f01',
    ],
  },
  bulkApprovalView: {
    approvedCount: 1,
    failedCount: 1,
    items: [
      { requestId: '2f8a6b1c-9d43-4a17-9c58-0b6e5f1a7d24', isApproved: true, error: null },
      {
        requestId: '7c1d0e93-4b2a-4f88-9a10-3d5c6b7e8f01',
        isApproved: false,
        error: {
          code: 'DOCUMENT_APPROVAL_NOT_AN_APPROVER',
          message: 'You were not named as an approver on this request',
        },
      },
    ],
  },
  approvalQueue: {
    items: [
      {
        round: APPROVAL_ROUND_EXAMPLE,
        document: {
          id: DOCUMENT_VIEW_EXAMPLE.id,
          title: DOCUMENT_VIEW_EXAMPLE.title,
          documentNumber: DOCUMENT_VIEW_EXAMPLE.documentNumber,
          type: TYPE_SUMMARY_EXAMPLE,
        },
      },
    ],
    meta: { page: 1, limit: 25, total: 1 },
  },
  approvalPendingCount: { pending: 3, overdue: 1 },
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
    rounds: [APPROVAL_ROUND_EXAMPLE],
  },
};
