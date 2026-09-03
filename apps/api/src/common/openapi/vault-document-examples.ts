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
} as const;
