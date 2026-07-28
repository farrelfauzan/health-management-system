import type {
  InvoiceItemTypeValue,
  InvoiceStatusValue,
  PaymentMethodValue,
  ServiceTariffCategoryValue,
} from '#billing/schemas';

/**
 * A price-list row. `price` is rupiah; Decimal columns surface as numbers —
 * the repository converts at the Prisma boundary so no Decimal type escapes
 * into the domain.
 */
export type ServiceTariffRecord = {
  id: string;
  code: string;
  name: string;
  category: ServiceTariffCategoryValue;
  icd9cmCode: string | null;
  price: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One billed line. `description`, `unitPrice`, and `amount` are the snapshot
 * that was billed; `serviceTariffId` / `medicationId` are provenance only, so
 * repricing a tariff or renaming a medication never rewrites an issued
 * invoice.
 */
export type InvoiceItemRecord = {
  id: string;
  invoiceId: string;
  itemType: InvoiceItemTypeValue;
  serviceTariffId: string | null;
  medicationId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The cashier's bill for one visit. `totalAmount` is stored, not derived: an
 * invoice is a financial document and its total is part of what was issued.
 */
export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  encounterId: string;
  patientId: string;
  status: InvoiceStatusValue;
  totalAmount: number;
  issuedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  voidedById: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceWithItemsRecord = InvoiceRecord & {
  items: InvoiceItemRecord[];
};

/**
 * Settlement of one invoice — exactly one per invoice in v1 (partial payments
 * out of scope). A payment is permanent: a mistake is corrected by voiding
 * the invoice and reissuing, never by editing or deleting the payment row.
 */
export type PaymentRecord = {
  id: string;
  invoiceId: string;
  method: PaymentMethodValue;
  amount: number;
  referenceNumber: string | null;
  notes: string | null;
  paidAt: Date;
  cashierId: string;
  createdAt: Date;
  updatedAt: Date;
};
