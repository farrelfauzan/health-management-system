/**
 * Response examples for a doctor's pelimpahan to a midwife (P25-T05). The
 * names are invented and the letter number is a placeholder; the ICD-9-CM
 * codes are real ones a bidan is realistically mandated for.
 */
const MANDATE_ID = '3f8b0c52-9d41-4f7a-8c2e-6a5d1b9e4c37';
const MIDWIFE_ID = '1f0a3d94-5c2b-4b31-9c8d-77bf1c3a0e21';
const MANDATING_DOCTOR_ID = '8d4c2a10-7e63-4b95-9f21-0c3e5a7b1d48';

export const DOCTOR_MANDATE_EXAMPLES = {
  item: {
    id: MANDATE_ID,
    midwifeDoctorId: MIDWIFE_ID,
    mandatingDoctorId: MANDATING_DOCTOR_ID,
    mandatingDoctorName: 'dr. Andi Wijaya',
    kind: 'MANDATE',
    instruction:
      'Pemasangan dan pencabutan implan kontrasepsi pada pasien KB, di bawah supervisi saya.',
    icd9cmCodes: ['69.7', '97.71'],
    validFrom: '2026-11-01',
    validUntil: '2026-11-30',
    instructionMimeType: 'application/pdf',
    status: 'ACTIVE',
    policyWarnings: [],
    revokedAt: null,
    revokeReason: null,
    createdAt: '2026-10-28T03:00:00.000Z',
    updatedAt: '2026-10-28T03:00:00.000Z',
  },
  revokedItem: {
    id: MANDATE_ID,
    midwifeDoctorId: MIDWIFE_ID,
    mandatingDoctorId: MANDATING_DOCTOR_ID,
    mandatingDoctorName: 'dr. Andi Wijaya',
    kind: 'MANDATE',
    instruction:
      'Pemasangan dan pencabutan implan kontrasepsi pada pasien KB, di bawah supervisi saya.',
    icd9cmCodes: ['69.7', '97.71'],
    validFrom: '2026-11-01',
    validUntil: '2026-11-30',
    instructionMimeType: 'application/pdf',
    status: 'REVOKED',
    policyWarnings: [],
    revokedAt: '2026-11-10T02:00:00.000Z',
    revokeReason: 'Dokter kembali bertugas di klinik',
    createdAt: '2026-10-28T03:00:00.000Z',
    updatedAt: '2026-11-10T02:00:00.000Z',
  },
  createRequest: {
    kind: 'MANDATE',
    mandatingDoctorId: MANDATING_DOCTOR_ID,
    instruction:
      'Pemasangan dan pencabutan implan kontrasepsi pada pasien KB, di bawah supervisi saya.',
    icd9cmCodes: ['69.7', '97.71'],
    validFrom: '2026-11-01',
    validUntil: '2026-11-30',
    instructionStorageKey: `doctor-mandates/${MIDWIFE_ID}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf`,
  },
  revokeRequest: {
    reason: 'Dokter kembali bertugas di klinik',
  },
  uploadUrlRequest: {
    mimeType: 'application/pdf',
    sizeBytes: 245760,
  },
  uploadUrl: {
    url: 'https://storage.example.com/hms/doctor-mandates/…?X-Amz-Signature=…',
    storageKey: `doctor-mandates/${MIDWIFE_ID}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf`,
    expiresAt: '2026-10-28T03:15:00.000Z',
    requiredHeaders: { 'Content-Type': 'application/pdf' },
  },
  download: {
    url: 'https://storage.example.com/hms/doctor-mandates/…?X-Amz-Signature=…',
    expiresAt: '2026-10-28T03:15:00.000Z',
  },
} as const;
