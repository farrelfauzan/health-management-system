import type { MedicationResponse } from '@hms/shared-types';

// Client-side policy until the medication contract gains a per-medication reorder threshold.
export const LOW_STOCK_THRESHOLD = 20;

export function countLowStockMedications(
  medications: readonly Pick<MedicationResponse, 'stockQty'>[],
): number {
  return medications.filter((medication) => medication.stockQty <= LOW_STOCK_THRESHOLD).length;
}
