import { describe, expect, it } from 'vitest';

import { parseExpiryReportItems } from './expiry-report';

describe('parseExpiryReportItems', () => {
  it('keeps valid generated expiry rows and rejects malformed unknown values', () => {
    const valid = {
      id: 'receipt-1',
      medicationId: 'medication-1',
      medicationCode: 'MED-1',
      medicationName: 'Paracetamol',
      batchNumber: 'LOT-1',
      expiryDate: '2026-08-01',
      quantity: 10,
      allocatedQty: 2,
      remainingQty: 8,
      receivedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      expiryStatus: 'EXPIRING',
      daysUntilExpiry: 2,
    };

    expect(parseExpiryReportItems([valid, null, { ...valid, expiryStatus: 'SAFE' }])).toEqual([
      valid,
    ]);
  });
});
