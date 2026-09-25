import { buildDemoStockReceipt } from './build-demo-stock-receipt';

describe('buildDemoStockReceipt', () => {
  const inputMedicationId = '00000000-0000-4000-8000-000000000001';

  it('receives a full batch for a medication with no stock', () => {
    const actualReceipt = buildDemoStockReceipt({
      medicationId: inputMedicationId,
      stockQty: 0,
      asOfDate: '2026-09-24',
    });
    expect(actualReceipt).toEqual({
      medicationId: inputMedicationId,
      batchNumber: 'DEMO-20260924',
      expiryDate: '2028-09-24',
      quantity: 500,
      notes: 'Demo seed stock',
    });
  });

  it('tops a low item up to the demo level rather than adding a whole batch', () => {
    const actualReceipt = buildDemoStockReceipt({
      medicationId: inputMedicationId,
      stockQty: 60,
      asOfDate: '2026-09-24',
    });
    expect(actualReceipt?.quantity).toBe(440);
  });

  /** This is what makes a second run receive nothing. */
  it('receives nothing when the item already has enough', () => {
    expect(
      buildDemoStockReceipt({
        medicationId: inputMedicationId,
        stockQty: 100,
        asOfDate: '2026-09-24',
      }),
    ).toBeNull();
  });

  it('never gives a batch an expiry date that does not exist', () => {
    const actualReceipt = buildDemoStockReceipt({
      medicationId: inputMedicationId,
      stockQty: 0,
      asOfDate: '2028-02-29',
    });
    expect(actualReceipt?.expiryDate).toBe('2030-02-28');
  });
});
