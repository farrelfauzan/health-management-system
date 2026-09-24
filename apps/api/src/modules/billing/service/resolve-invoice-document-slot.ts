import { InvoiceDocumentSlot, InvoiceStatusValue } from '@hms/shared-types';

/**
 * The render slot an invoice's current document lives in: VOID wins, then
 * PAID, then ISSUED. Each state keeps its own row — the ISSUED snapshot is
 * never rewritten when the bill is paid or voided (FR-E1-09), it is joined by
 * the receipt or the watermarked copy.
 */
export function resolveInvoiceDocumentSlot(status: InvoiceStatusValue): InvoiceDocumentSlot {
  return {
    hasVoidWatermark: status === 'VOID',
    isPaidReceipt: status === 'PAID',
  };
}
