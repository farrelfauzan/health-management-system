import type { ExpiryReportItemResponse } from '@hms/shared-types';

export function parseExpiryReportItems(items: unknown[]): ExpiryReportItemResponse[] {
  return items.filter((item): item is ExpiryReportItemResponse => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const row = item as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      typeof row.medicationId === 'string' &&
      typeof row.medicationCode === 'string' &&
      typeof row.medicationName === 'string' &&
      typeof row.batchNumber === 'string' &&
      typeof row.quantity === 'number' &&
      typeof row.allocatedQty === 'number' &&
      typeof row.remainingQty === 'number' &&
      typeof row.receivedAt === 'string' &&
      typeof row.createdAt === 'string' &&
      (row.expiryStatus === 'EXPIRED' ||
        row.expiryStatus === 'EXPIRING' ||
        row.expiryStatus === 'UNKNOWN') &&
      (row.expiryDate === undefined || typeof row.expiryDate === 'string') &&
      (row.daysUntilExpiry === undefined || typeof row.daysUntilExpiry === 'number')
    );
  });
}
