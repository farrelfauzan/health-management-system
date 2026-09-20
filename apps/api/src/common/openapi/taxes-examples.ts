const adminUserId = '0b8e3c1a-5d2f-4a6b-9c7e-1f2a3b4c5d6e';
const timestamp = '2026-09-19T03:00:00.000Z';
const barangTaxCodeId = '5f3c2b1a-0d9e-4c8b-a7f6-e5d4c3b2a190';
const jasaMedisTaxCodeId = '6a4d3c2b-1e0f-4d9c-b8a7-f6e5d4c3b2a1';
const barangRate = {
  id: '7b5e4d3c-2f1a-4e0d-9c8b-a7f6e5d4c3b2',
  ratePercent: 12,
  dppNumerator: 11,
  dppDenominator: 12,
  effectiveRatePercent: 11,
  effectiveFrom: '2025-01-01',
};

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
  taxCodes: {
    view: {
      id: barangTaxCodeId,
      code: 'BARANG-PPN',
      name: 'Barang kena pajak (obat, alat kesehatan)',
      ppnTreatment: 'STANDARD',
      fakturTransactionCode: '04',
      isSystem: true,
      isActive: true,
      currentRate: barangRate,
      rates: [barangRate],
      defaultTargets: ['MEDICATION'],
      overrideCount: 3,
    },
    createRequest: {
      code: 'ESTETIKA',
      name: 'Perawatan estetika',
      ppnTreatment: 'STANDARD',
      fakturTransactionCode: '04',
      initialRate: {
        ratePercent: 12,
        dppNumerator: 11,
        dppDenominator: 12,
        effectiveFrom: '2025-01-01',
      },
    },
    updateRequest: { name: 'Barang kena pajak', isActive: true },
    rateRequest: {
      ratePercent: 12,
      dppNumerator: 11,
      dppDenominator: 12,
      effectiveFrom: '2027-01-01',
    },
  },
  categoryDefaults: {
    list: [
      { target: 'CONSULTATION', taxCodeId: jasaMedisTaxCodeId, taxCode: 'JASA-MEDIS' },
      { target: 'MEDICATION', taxCodeId: barangTaxCodeId, taxCode: 'BARANG-PPN' },
    ],
    updateRequest: { defaults: [{ target: 'OTHER', taxCodeId: barangTaxCodeId }] },
  },
  assignments: {
    row: {
      kind: 'MEDICATION',
      id: '8c6f5e4d-3a2b-4f1e-8d9c-b8a7f6e5d4c3',
      code: 'AMOX500',
      name: 'Amoxicillin 500 mg',
      category: 'OBAT_KERAS',
      price: 1500,
      source: 'CATEGORY_DEFAULT',
      effectiveTaxCode: {
        id: barangTaxCodeId,
        code: 'BARANG-PPN',
        name: 'Barang kena pajak (obat, alat kesehatan)',
        ppnTreatment: 'STANDARD',
      },
    },
    meta: { page: 1, limit: 20, total: 1, unresolvedCount: 0 },
    bulkRequest: {
      targets: [{ kind: 'SERVICE_TARIFF', id: '9d7a6f5e-4b3c-4a2f-9e0d-c9b8a7f6e5d4' }],
      taxCodeId: '1e8b7a6f-5c4d-4b3a-8f1e-d0c9b8a7f6e5',
    },
    bulkResult: { updatedCount: 1 },
  },
} as const;
