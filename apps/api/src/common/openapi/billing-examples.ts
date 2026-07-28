/**
 * Canonical examples for the billing (kasir) endpoints, mirrored by
 * `ApiEndpoint` into the OpenAPI document. Money values are rupiah numbers.
 */
export const BILLING_EXAMPLES = {
  paginationMeta: {
    page: 1,
    limit: 10,
    total: 1,
  },
  serviceTariff: {
    listItem: {
      id: '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e',
      code: 'KONSULTASI-UMUM',
      name: 'Konsultasi Dokter Umum',
      category: 'CONSULTATION',
      price: 50000,
      isActive: true,
      createdAt: '2026-07-20T08:00:00.000Z',
      updatedAt: '2026-07-20T08:00:00.000Z',
    },
    createRequest: {
      code: 'TIND-INJEKSI',
      name: 'Injeksi Antibiotik',
      category: 'PROCEDURE',
      icd9cmCode: '99.21',
      price: 35000,
    },
    updateRequest: {
      price: 40000,
      isActive: true,
    },
  },
  invoice: {
    listItem: {
      id: 'a3f2b1c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d',
      invoiceNumber: 'INV/20260728/0001',
      encounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
      patientId: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
      patient: {
        id: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
        mrn: 'RM-000123',
        fullName: 'Budi Santoso',
      },
      status: 'ISSUED',
      totalAmount: 125000,
      itemCount: 3,
      issuedAt: '2026-07-28T03:15:00.000Z',
      createdAt: '2026-07-28T03:10:00.000Z',
      updatedAt: '2026-07-28T03:15:00.000Z',
    },
    detailItems: [
      {
        id: 'b4c5d6e7-f8a9-4b0c-9d1e-2f3a4b5c6d7e',
        itemType: 'CONSULTATION',
        serviceTariffId: '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e',
        description: 'Konsultasi Dokter Umum',
        quantity: 1,
        unitPrice: 50000,
        amount: 50000,
      },
    ],
    generateRequest: {
      encounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
    },
    generationGaps: [
      {
        reason: 'UNPRICED_MEDICATION',
        description: 'Paracetamol 500 mg',
      },
    ],
    paymentRequest: {
      method: 'CASH',
      amount: 125000,
    },
    payment: {
      id: 'c5d6e7f8-a9b0-4c1d-8e2f-3a4b5c6d7e8f',
      invoiceId: 'a3f2b1c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d',
      method: 'CASH',
      amount: 125000,
      paidAt: '2026-07-28T03:20:00.000Z',
      cashierId: 'd6e7f8a9-b0c1-4d2e-9f3a-4b5c6d7e8f9a',
      createdAt: '2026-07-28T03:20:00.000Z',
    },
    voidRequest: {
      reason: 'Wrong consultation tariff applied; reissuing with the corrected price list',
    },
  },
} as const;
