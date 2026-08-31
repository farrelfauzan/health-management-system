/**
 * Canonical examples for the clinic-profile endpoints (P16-T02), mirrored by
 * `ApiEndpoint` into the OpenAPI document.
 *
 * The signed URLs are deliberately obvious placeholders: a real one is a
 * bearer credential with an expiry, and an example that looked live would
 * invite someone to paste one into a document that outlives it.
 */
export const CLINIC_PROFILE_EXAMPLES = {
  profile: {
    name: 'Klinik Sehat Bersama',
    legalName: 'PT Sehat Bersama Indonesia',
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '(022) 1234567',
    email: 'halo@kliniksehat.id',
    licenseNumber: '440/1234/DPMPTSP',
    taxId: '01.234.567.8-901.000',
    hasLogo: true,
    logoUrl: 'https://storage.example/clinic-profile/logo/stored/…?X-Amz-Signature=…',
    updatedAt: '2026-09-18T02:15:00.000Z',
  },
  updateRequest: {
    name: 'Klinik Sehat Bersama',
    address: 'Jl. Merdeka No. 12, Bandung',
    licenseNumber: '440/1234/DPMPTSP',
  },
  logoUploadUrlRequest: {
    mimeType: 'image/png',
    sizeBytes: 148_223,
  },
  logoUploadUrl: {
    url: 'https://storage.example/clinic-profile/logo/staged/…?X-Amz-Signature=…',
    storageKey: 'clinic-profile/logo/staged/2f1c8e0a-9b3d-4f77-b0a1-6d5e4c3b2a19',
    expiresAt: '2026-09-18T02:20:00.000Z',
    requiredHeaders: {
      'Content-Type': 'image/png',
      'Content-Length': '148223',
    },
  },
} as const;
