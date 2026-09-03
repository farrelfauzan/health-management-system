/**
 * Response examples for the practitioner licence expiry dashboard (P16-T19).
 * Values are illustrative only: the licence numbers below are obvious
 * placeholders rather than plausible STR/SIP numbers, because an example that
 * looked genuine is the kind of thing that gets copied out of API docs into a
 * fixture and then into a support ticket.
 *
 * Note what these examples do **not** contain, and that it is not an
 * oversight: no document id, no filename, no flag saying a scan was uploaded.
 * The dashboard is built from `doctor_licenses` alone so that reading it
 * cannot reveal the existence of anything in a doctor's vault (FR-E3-35), and
 * an example that showed such a field would invite one into the contract.
 */
export const DOCTOR_LICENSE_EXPIRY_EXAMPLES = {
  buckets: {
    expired: [
      {
        licenseId: 'c4c9c0a2-6f8e-4a2c-9d67-2b8f0a4e1d55',
        doctorId: '1f0a3d94-5c2b-4b31-9c8d-77bf1c3a0e21',
        doctorName: 'dr. Rina Wijaya, Sp.PD',
        type: 'SIP',
        licenseNumber: 'SIP-EXAMPLE-0001',
        issuedAt: '2021-03-12',
        expiresAt: '2026-08-20',
        daysUntilExpiry: -14,
      },
    ],
    within30Days: [
      {
        licenseId: 'f1d7b8e3-4a90-4c1f-8b52-93ea6d0c7f18',
        doctorId: '9c31a7f5-2d68-4e0b-b41a-5f2c8d90e6b3',
        doctorName: 'dr. Andi Pratama',
        type: 'SIP',
        licenseNumber: 'SIP-EXAMPLE-0002',
        issuedAt: '2021-10-01',
        expiresAt: '2026-09-30',
        daysUntilExpiry: 27,
      },
    ],
    within60Days: [],
    within90Days: [
      {
        licenseId: 'a8e2c611-73bd-4f05-9a3e-64c1b7d28f40',
        doctorName: 'dr. Siti Handayani, Sp.A',
        doctorId: '4b6e9c02-8f13-4d7a-a5c9-0e83b2f61a74',
        type: 'STR',
        licenseNumber: 'STR-EXAMPLE-0003',
        issuedAt: '2021-11-18',
        expiresAt: '2026-11-18',
        daysUntilExpiry: 76,
      },
    ],
  },
} as const;
