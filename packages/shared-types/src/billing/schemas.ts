import { z } from 'zod';

export const SERVICE_TARIFF_CATEGORIES = ['CONSULTATION', 'PROCEDURE', 'OTHER'] as const;

export const serviceTariffCategorySchema = z.enum(SERVICE_TARIFF_CATEGORIES);

export type ServiceTariffCategoryValue = z.infer<typeof serviceTariffCategorySchema>;

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;

export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);

export type InvoiceStatusValue = z.infer<typeof invoiceStatusSchema>;

/**
 * Allowed invoice status transitions. A DRAFT can be regenerated freely, so it
 * only ever moves forward to ISSUED or is voided. An ISSUED invoice is a
 * document handed to the patient: correcting it means VOID (with reason and
 * audit) plus a fresh invoice, never editing in place. PAID is terminal for
 * v1 — refunds are out of scope, so a mistaken payment is an operational
 * correction, not a status transition. VOID is terminal by definition.
 */
export const INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatusValue,
  readonly InvoiceStatusValue[]
> = {
  DRAFT: ['ISSUED', 'VOID'],
  ISSUED: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
} as const;

export const INVOICE_ITEM_TYPES = ['CONSULTATION', 'PROCEDURE', 'MEDICATION', 'OTHER'] as const;

export const invoiceItemTypeSchema = z.enum(INVOICE_ITEM_TYPES);

export type InvoiceItemTypeValue = z.infer<typeof invoiceItemTypeSchema>;

/**
 * How an invoice was settled. INSURANCE covers private payers recorded
 * manually; BPJS claims are not payments and arrive with Phase 11.
 */
export const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'QRIS', 'INSURANCE'] as const;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export type PaymentMethodValue = z.infer<typeof paymentMethodSchema>;

export function canTransitionInvoiceStatus(
  fromStatus: InvoiceStatusValue,
  toStatus: InvoiceStatusValue,
): boolean {
  return INVOICE_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}
