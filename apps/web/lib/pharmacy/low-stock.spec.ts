import { describe, expect, it } from 'vitest';

import { countLowStockMedications, LOW_STOCK_THRESHOLD } from './low-stock';

describe('countLowStockMedications', () => {
  it('counts medications at or below the threshold only', () => {
    const inputMedications = [
      { stockQty: 0 },
      { stockQty: LOW_STOCK_THRESHOLD },
      { stockQty: LOW_STOCK_THRESHOLD + 1 },
      { stockQty: 500 },
    ];

    expect(countLowStockMedications(inputMedications)).toBe(2);
  });

  it('returns zero for an empty formulary', () => {
    expect(countLowStockMedications([])).toBe(0);
  });
});
