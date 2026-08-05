/**
 * Response and request examples for a user's own knowledge base (P15-T20).
 * Values are illustrative only: no example carries a real storage key, a real
 * signed URL, or any patient-identifying string — a personal knowledge base is
 * policy-bound to contain no patient data, because its chunks reach the AI
 * provider.
 */
export const PERSONAL_DOCUMENT_EXAMPLES = {
  uploadUrlRequest: {
    mimeType: 'application/pdf',
    sizeBytes: 96256,
  },
  uploadUrl: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/doctor/4c1e8b90-72da-4f3a-8f21-6b90ad5e4412.pdf?X-Amz-Signature=...',
    storageKey: 'documents/doctor/4c1e8b90-72da-4f3a-8f21-6b90ad5e4412.pdf',
    expiresAt: '2026-08-05T09:05:00.000Z',
    requiredHeaders: {
      'Content-Type': 'application/pdf',
      'Content-Length': '96256',
    },
  },
  confirmRequest: {
    storageKey: 'documents/doctor/4c1e8b90-72da-4f3a-8f21-6b90ad5e4412.pdf',
    title: 'Panduan Tatalaksana Hipertensi 2026',
    language: 'ID',
  },
  document: {
    id: '7b3f2c19-5d84-4a6e-9c02-1f8ad7c35e60',
    ownerType: 'DOCTOR',
    ownerId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    purpose: 'PERSONAL_KNOWLEDGE_BASE',
    title: 'Panduan Tatalaksana Hipertensi 2026',
    mimeType: 'application/pdf',
    sizeBytes: 96256,
    language: 'ID',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-08-05T09:07:41.000Z',
    chunkCount: 24,
    createdAt: '2026-08-05T09:05:12.000Z',
    updatedAt: '2026-08-05T09:07:41.000Z',
  },
  pendingDocument: {
    id: '7b3f2c19-5d84-4a6e-9c02-1f8ad7c35e60',
    ownerType: 'DOCTOR',
    ownerId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    purpose: 'PERSONAL_KNOWLEDGE_BASE',
    title: 'Panduan Tatalaksana Hipertensi 2026',
    mimeType: 'application/pdf',
    sizeBytes: 96256,
    language: 'ID',
    ingestStatus: 'PENDING',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 0,
    createdAt: '2026-08-05T09:05:12.000Z',
    updatedAt: '2026-08-05T09:05:12.000Z',
  },
  updateRequest: {
    title: 'Panduan Tatalaksana Hipertensi 2026 (revisi)',
  },
  download: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/doctor/4c1e8b90-72da-4f3a-8f21-6b90ad5e4412.pdf?X-Amz-Signature=...',
    expiresAt: '2026-08-05T09:12:00.000Z',
  },
  deletedDocument: {
    id: '7b3f2c19-5d84-4a6e-9c02-1f8ad7c35e60',
    deletedAt: '2026-08-05T10:22:03.000Z',
    chunksRemoved: 24,
  },
} as const;
