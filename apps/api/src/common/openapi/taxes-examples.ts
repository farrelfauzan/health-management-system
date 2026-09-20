const adminUserId = '0b8e3c1a-5d2f-4a6b-9c7e-1f2a3b4c5d6e';
const timestamp = '2026-09-19T03:00:00.000Z';

/** Request and response examples for the P27 tax endpoints. */
export const TAXES_EXAMPLES = {
  taxSettings: {
    view: {
      taxpayerType: 'PT_PERORANGAN',
      incomeTaxRegime: 'PP55_FINAL',
      pp55StartYear: 2025,
      isPkp: false,
      nitku: '0012345678901000000000',
      npwp: '0012345678901000',
      npwpStatus: 'VALID',
      updatedById: adminUserId,
      updatedAt: timestamp,
    },
    updateRequest: {
      taxpayerType: 'PT_PERORANGAN',
      incomeTaxRegime: 'PP55_FINAL',
      pp55StartYear: 2025,
    },
  },
} as const;
