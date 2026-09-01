/**
 * Response and request examples for patient clinical files (P16-T08). Values
 * are illustrative only: no example carries a real storage key, a real signed
 * URL, or a real patient's name — the patient-facing strings below are
 * invented fixtures.
 */
export const PATIENT_DOCUMENT_EXAMPLES = {
  uploadUrlRequest: {
    mimeType: 'application/pdf',
    sizeBytes: 3145728,
  },
  uploadUrl: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/patient/9f7c2a54-1be0-4c11-9c6f-1d2f8a0b3c44.pdf?X-Amz-Signature=...',
    storageKey: 'documents/patient/9f7c2a54-1be0-4c11-9c6f-1d2f8a0b3c44.pdf',
    expiresAt: '2026-09-01T09:05:00.000Z',
    requiredHeaders: {
      'Content-Type': 'application/pdf',
      'Content-Length': '3145728',
    },
  },
  confirmRequest: {
    storageKey: 'documents/patient/9f7c2a54-1be0-4c11-9c6f-1d2f8a0b3c44.pdf',
    title: 'Hasil laboratorium darah lengkap',
    category: 'LAB_RESULT',
    documentDate: '2026-08-25',
    language: 'ID',
  },
  document: {
    id: '2d6a4f08-93bc-47e1-8a5d-6c1e0b7f9a32',
    patientId: '5b8e1c70-2f4a-4d6b-9e3c-8a7f0d1b2c43',
    encounterId: null,
    admissionId: null,
    category: 'LAB_RESULT',
    title: 'Hasil laboratorium darah lengkap',
    mimeType: 'application/pdf',
    sizeBytes: 3145728,
    language: 'ID',
    documentDate: '2026-08-25',
    notes: 'Dibawa pasien dari lab eksternal',
    releasedToPatient: false,
    releasedAt: null,
    releasedById: null,
    uploadedById: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    createdAt: '2026-09-01T09:05:12.000Z',
    updatedAt: '2026-09-01T09:05:12.000Z',
  },
  releasedDocument: {
    id: '2d6a4f08-93bc-47e1-8a5d-6c1e0b7f9a32',
    patientId: '5b8e1c70-2f4a-4d6b-9e3c-8a7f0d1b2c43',
    encounterId: null,
    admissionId: null,
    category: 'LAB_RESULT',
    title: 'Hasil laboratorium darah lengkap',
    mimeType: 'application/pdf',
    sizeBytes: 3145728,
    language: 'ID',
    documentDate: '2026-08-25',
    notes: 'Dibawa pasien dari lab eksternal',
    releasedToPatient: true,
    releasedAt: '2026-09-02T10:15:00.000Z',
    releasedById: '7c9d0e1f-2a3b-4c5d-8e9f-1a2b3c4d5e6f',
    uploadedById: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    createdAt: '2026-09-01T09:05:12.000Z',
    updatedAt: '2026-09-02T10:15:00.000Z',
  },
  updateRequest: {
    category: 'RADIOLOGY',
    notes: 'Kategori dikoreksi setelah verifikasi',
  },
  deleteRequest: {
    reason: 'Filed against wrong patient',
  },
  deletedDocument: {
    id: '2d6a4f08-93bc-47e1-8a5d-6c1e0b7f9a32',
    deletedAt: '2026-09-03T08:00:00.000Z',
    deleteReason: 'Filed against wrong patient',
  },
  download: {
    url: 'https://example-bucket.s3.amazonaws.com/documents/patient/9f7c2a54-1be0-4c11-9c6f-1d2f8a0b3c44.pdf?X-Amz-Signature=...',
    expiresAt: '2026-09-01T09:10:00.000Z',
  },
  portalDocument: {
    id: '2d6a4f08-93bc-47e1-8a5d-6c1e0b7f9a32',
    category: 'LAB_RESULT',
    title: 'Hasil laboratorium darah lengkap',
    mimeType: 'application/pdf',
    sizeBytes: 3145728,
    documentDate: '2026-08-25',
    releasedAt: '2026-09-02T10:15:00.000Z',
    createdAt: '2026-09-01T09:05:12.000Z',
  },
} as const;
