/**
 * Response and request examples for the shared document store (P15-T10).
 * Values are illustrative only: no example carries a real storage key, a real
 * signed URL, or any patient-identifying string — the clinic corpus is
 * policy-bound to contain neither.
 */
/**
 * The default posture (`P16-T33`): `CLINIC_CORPUS_DOCUMENT` ships with
 * approval off, so a clinic that never switches it on sees no registry row
 * and no approval column (US-E5-06).
 */
const NO_APPROVAL_EXAMPLE = {
  isApprovalRequired: false,
  managedDocumentId: null,
  status: null,
  pendingRound: null,
};

export const DOCUMENT_MANAGEMENT_EXAMPLES = {
  uploadUrlRequest: {
    mimeType: 'application/pdf',
    sizeBytes: 184320,
  },
  uploadUrl: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf?X-Amz-Signature=...',
    storageKey: 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
    expiresAt: '2026-08-03T09:05:00.000Z',
    requiredHeaders: {
      'Content-Type': 'application/pdf',
      'Content-Length': '184320',
    },
  },
  confirmRequest: {
    storageKey: 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
    title: 'SOP Alur Pendaftaran Pasien BPJS',
    purpose: 'FAQ_KNOWLEDGE_BASE',
    visibility: 'BOTH',
    language: 'ID',
  },
  pendingDocument: {
    id: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'SOP Alur Pendaftaran Pasien BPJS',
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    visibility: 'BOTH',
    language: 'ID',
    ingestStatus: 'PENDING',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 0,
    uploadedById: 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d',
    approval: NO_APPROVAL_EXAMPLE,
    createdAt: '2026-08-03T09:00:00.000Z',
    updatedAt: '2026-08-03T09:00:00.000Z',
  },
  pendingApprovalDocument: {
    id: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'SOP Alur Pendaftaran Pasien BPJS',
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    visibility: 'BOTH',
    language: 'ID',
    // Stored, but not queued: the worker cannot see it and the retrieval
    // predicate excludes it until the registry row reaches ISSUED.
    ingestStatus: 'NOT_APPLICABLE',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 0,
    uploadedById: 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d',
    approval: {
      isApprovalRequired: true,
      managedDocumentId: 'b81f3d02-6c4a-4e19-95d7-2a0e8c5f7b46',
      status: 'DRAFT',
      pendingRound: null,
    },
    createdAt: '2026-08-03T09:00:00.000Z',
    updatedAt: '2026-09-06T11:00:00.000Z',
  },
  staffOnlyDocument: {
    id: '7c4e9b1d-2a3f-4b5c-8d6e-0f1a2b3c4d5e',
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'Internal Escalation Protocol',
    mimeType: 'text/markdown',
    sizeBytes: 4096,
    visibility: 'DOCTOR',
    language: 'EN',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-08-03T09:02:00.000Z',
    chunkCount: 12,
    uploadedById: 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d',
    approval: NO_APPROVAL_EXAMPLE,
    createdAt: '2026-08-02T11:00:00.000Z',
    updatedAt: '2026-08-03T09:02:00.000Z',
  },
  updateRequest: {
    visibility: 'DOCTOR',
  },
  download: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf?X-Amz-Signature=...',
    expiresAt: '2026-08-03T09:05:00.000Z',
  },
  preview: {
    documentId: '9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1',
    mimeType: 'text/markdown',
    text: '# Jam layanan\n\nKlinik buka **Senin–Sabtu**.\n\n| Hari | Jam |\n| --- | --- |\n| Senin–Jumat | 08.00–20.00 |\n| Sabtu | 08.00–14.00 |',
    characterCount: 128,
    totalCharacterCount: 128,
    isTruncated: false,
  },
  deletedDocument: {
    id: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
    deletedAt: '2026-08-03T10:00:00.000Z',
    chunksRemoved: 12,
  },
  approvalContext: {
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    defaultApprovers: [
      { id: 'd7c3b2a1-4e5f-4a6b-8c9d-0e1f2a3b4c5d', email: 'kepala.klinik@salingjaga.id' },
    ],
  },
  submitForApprovalRequest: {
    documentIds: [
      '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
      '9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1',
    ],
    approverIds: ['d7c3b2a1-4e5f-4a6b-8c9d-0e1f2a3b4c5d'],
    dueAt: '2026-09-17T09:00:00.000Z',
  },
  bulkSubmission: {
    submittedCount: 1,
    failedCount: 1,
    items: [
      {
        documentId: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        isSubmitted: true,
        error: null,
      },
      {
        documentId: '9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1',
        isSubmitted: false,
        error: {
          code: 'DOCUMENT_NOT_SUBMITTABLE',
          message: 'This document is already waiting for approval',
        },
      },
    ],
  },
} as const;
