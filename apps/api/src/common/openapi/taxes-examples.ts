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
  taxReports: {
    listItem: {
      id: '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b',
      period: '2026-08',
      kind: 'PP55_OMZET',
      status: 'FINALIZED',
      taxDue: 1000000,
      isOutOfDate: false,
    },
    listMeta: { year: 2026, applicableKinds: ['PP55_OMZET', 'PPH21_NON_EMPLOYEE'] },
    createRequest: { period: '2026-08', kind: 'PP55_OMZET' },
    identifiers: {
      reportId: '7c6b5a4f-3e2d-4c1b-8a09-f8e7d6c5b4a3',
      period: '2026-10',
      clinicians: [
        {
          doctorId: '4f3e2d1c-0b9a-4877-8665-544332211000',
          identityKind: 'NIK',
          taxIdentityNumber: '3171000000000001',
        },
      ],
    },
    pph21View: {
      id: '7c6b5a4f-3e2d-4c1b-8a09-f8e7d6c5b4a3',
      period: '2026-10',
      kind: 'PPH21_NON_EMPLOYEE',
      status: 'DRAFT',
      summary: {
        kind: 'PPH21_NON_EMPLOYEE',
        dppPercent: 50,
        bracketsEffectiveFrom: '2022-01-01',
        clinicianCount: 1,
        incompleteIdentityCount: 0,
        totals: { grossFee: 20000000, taxBase: 10000000, taxAmount: 500000 },
        taxAccountCode: '411121',
        depositTypeCode: '100',
        paymentDueDate: '2026-11-15',
        reportingDueDate: '2026-11-20',
      },
      lines: [
        {
          doctorId: '4f3e2d1c-0b9a-4877-8665-544332211000',
          doctorName: 'Andi Prasetyo',
          profession: 'DOCTOR',
          identityStatus: 'NIK',
          identityMasked: '••••••••0001',
          entryCount: 40,
          lineAmount: 33333333,
          grossFee: 20000000,
          taxBase: 10000000,
          slices: [
            {
              lowerBound: 0,
              upperBound: 60000000,
              ratePercent: 5,
              taxableAmount: 10000000,
              taxAmount: 500000,
            },
          ],
          taxAmount: 500000,
        },
      ],
      generatedAt: '2026-11-02T02:00:00.000Z',
      isOutOfDate: false,
      differences: [],
    },
    pdfDownload: {
      url: 'https://storage.example/tax-report/document/5b7c9d1e-2f3a-4b5c-8d6e-7f8091a2b3c4.pdf?X-Amz-Signature=example',
      fileName: 'pajak-pp55-omzet-2026-08.pdf',
      expiresAt: '2026-09-19T08:15:00.000Z',
    },
    view: {
      id: '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b',
      period: '2026-08',
      kind: 'PP55_OMZET',
      status: 'DRAFT',
      summary: {
        kind: 'PP55_OMZET',
        taxpayerType: 'INDIVIDUAL',
        ratePercent: 0.5,
        paymentCount: 412,
        yearToDateOmzetBefore: 300000000,
        nonTaxableAllowanceUsed: 200000000,
        totals: { grossOmzet: 400000000, taxableOmzet: 200000000, taxDue: 1000000 },
        taxAccountCode: '411128',
        depositTypeCode: '420',
        paymentDueDate: '2026-09-15',
        reportingDueDate: '2026-09-15',
      },
      lines: [
        {
          paymentId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          invoiceNumber: 'INV/20260803/0012',
          paidAt: '2026-08-03T04:12:00.000Z',
          method: 'CASH',
          amount: 150000,
        },
      ],
      generatedAt: '2026-09-02T02:00:00.000Z',
      isOutOfDate: false,
      differences: [],
    },
  },
  priceBreakdowns: {
    row: {
      kind: 'MEDICATION',
      id: '8c6f5e4d-3a2b-4f1e-8d9c-b8a7f6e5d4c3',
      status: 'TAXED',
      taxCode: 'BARANG-PPN',
      ppnTreatment: 'STANDARD',
      price: 111000,
      priceBeforeTax: 100000,
      taxAmount: 11000,
    },
  },
} as const;
