/**
 * Response examples for a midwife's delegated authorities (P25-T02). The
 * decree number below follows the district decision-letter pattern but is
 * a placeholder; the names are invented.
 */
const AUTHORITY_ID = '7c2e1f7a-3b6d-4d0e-9a1f-5e8c2b7d4a10';
const DOCTOR_ID = '1f0a3d94-5c2b-4b31-9c8d-77bf1c3a0e21';

export const DOCTOR_AUTHORITY_EXAMPLES = {
  item: {
    id: AUTHORITY_ID,
    doctorId: DOCTOR_ID,
    kind: 'IUD_IMPLANT',
    trainingCertificateNumber: 'CTU-2025-0042',
    decreeNumber: '440/123/2026',
    decreeIssuedAt: '2025-12-15',
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
    hasDecree: true,
    decreeMimeType: 'application/pdf',
    status: 'ACTIVE',
    revokedAt: null,
    revokeReason: null,
    createdAt: '2026-01-02T03:00:00.000Z',
    updatedAt: '2026-01-02T03:00:00.000Z',
  },
  revokedItem: {
    id: AUTHORITY_ID,
    doctorId: DOCTOR_ID,
    kind: 'IUD_IMPLANT',
    trainingCertificateNumber: 'CTU-2025-0042',
    decreeNumber: '440/123/2026',
    decreeIssuedAt: '2025-12-15',
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
    hasDecree: true,
    decreeMimeType: 'application/pdf',
    status: 'REVOKED',
    revokedAt: '2026-06-01T02:00:00.000Z',
    revokeReason: 'Decision letter withdrawn by the district health office',
    createdAt: '2026-01-02T03:00:00.000Z',
    updatedAt: '2026-06-01T02:00:00.000Z',
  },
  createRequest: {
    kind: 'IUD_IMPLANT',
    trainingCertificateNumber: 'CTU-2025-0042',
    decreeNumber: '440/123/2026',
    decreeIssuedAt: '2025-12-15',
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
    decreeStorageKey: `doctor-authorities/${DOCTOR_ID}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf`,
  },
  updateRequest: {
    decreeNumber: '440/124/2026',
    validUntil: '2028-12-31',
  },
  revokeRequest: {
    reason: 'Decision letter withdrawn by the district health office',
  },
  uploadUrlRequest: {
    mimeType: 'application/pdf',
    sizeBytes: 245760,
  },
  uploadUrl: {
    url: 'https://storage.example.com/hms/doctor-authorities/…?X-Amz-Signature=…',
    storageKey: `doctor-authorities/${DOCTOR_ID}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf`,
    expiresAt: '2026-01-02T03:15:00.000Z',
    requiredHeaders: { 'Content-Type': 'application/pdf' },
  },
  download: {
    url: 'https://storage.example.com/hms/doctor-authorities/…?X-Amz-Signature=…',
    expiresAt: '2026-01-02T03:15:00.000Z',
  },
} as const;
