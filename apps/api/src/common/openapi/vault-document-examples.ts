/**
 * Response and request examples for a practitioner's own document vault
 * (P16-T17). Values are illustrative only: no example carries a real storage
 * key, a real signed URL, a real STR number or a real NIK.
 *
 * The reference numbers below are deliberately obvious placeholders. A vault
 * holds identity documents, and an example that looked like a genuine
 * registration number is the kind of thing that gets copied out of API docs
 * into a test fixture and then into a support ticket.
 */
export const VAULT_DOCUMENT_EXAMPLES = {
  uploadUrlRequest: {
    mimeType: 'application/pdf',
    sizeBytes: 148480,
  },
  uploadUrl: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/vault/doctor/7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730.pdf?X-Amz-Signature=...',
    storageKey: 'documents/vault/doctor/7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730.pdf',
    expiresAt: '2026-09-03T09:05:00.000Z',
    requiredHeaders: {
      'Content-Type': 'application/pdf',
      'Content-Length': '148480',
    },
  },
  confirmRequest: {
    storageKey: 'documents/vault/doctor/7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730.pdf',
    title: 'STR Dokter Umum',
    language: 'ID',
    vaultCategory: 'REGISTRATION_LICENCE',
    referenceNumber: 'STR-EXAMPLE-0000',
    issuedAt: '2024-03-14',
    expiresAt: '2029-03-14',
  },
  updateRequest: {
    title: 'STR Dokter Umum (perpanjangan)',
    expiresAt: '2034-03-14',
  },
  document: {
    id: '7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730',
    title: 'STR Dokter Umum',
    mimeType: 'application/pdf',
    sizeBytes: 148480,
    language: 'ID',
    vaultCategory: 'REGISTRATION_LICENCE',
    referenceNumber: 'STR-EXAMPLE-0000',
    issuedAt: '2024-03-14',
    expiresAt: '2029-03-14',
    createdAt: '2026-09-03T09:00:00.000Z',
    updatedAt: '2026-09-03T09:00:00.000Z',
  },
  download: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/vault/doctor/7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730.pdf?X-Amz-Signature=...',
    expiresAt: '2026-09-03T09:05:00.000Z',
  },
  deletedDocument: {
    id: '7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730',
    deleted: true,
  },
  shareRequest: {
    granteeId: 'd51c3a7e-90b4-4f26-8a1d-6c73e0b9f482',
    expiresAt: '2026-10-03T09:00:00.000Z',
  },
  share: {
    id: '2a6f81c4-3e57-4d90-b8ac-51f2d7e40691',
    documentId: '7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730',
    granteeId: 'd51c3a7e-90b4-4f26-8a1d-6c73e0b9f482',
    granteeEmail: 'admin@example.test',
    expiresAt: '2026-10-03T09:00:00.000Z',
    revokedAt: null,
    lastAccessedAt: '2026-09-03T11:42:00.000Z',
    openCount: 2,
    createdAt: '2026-09-03T09:10:00.000Z',
    isLive: true,
  },
  revokedShare: {
    id: '2a6f81c4-3e57-4d90-b8ac-51f2d7e40691',
    revokedAt: '2026-09-04T08:00:00.000Z',
  },
  shareRecipient: {
    id: 'd51c3a7e-90b4-4f26-8a1d-6c73e0b9f482',
    email: 'admin@example.test',
    roleCodes: ['ADMIN'],
  },
  sharedWithMeDocument: {
    id: '7b2d4e10-9c31-4a55-b0e8-2f61ac9d7730',
    title: 'STR Dokter Umum',
    mimeType: 'application/pdf',
    sizeBytes: 148480,
    sharedByEmail: 'dokter@example.test',
    sharedAt: '2026-09-03T09:10:00.000Z',
    expiresAt: '2026-10-03T09:00:00.000Z',
  },
} as const;
