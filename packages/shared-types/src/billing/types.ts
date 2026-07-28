import type {
  InvoiceItemTypeValue,
  InvoiceStatusValue,
  PaymentMethodValue,
  ServiceTariffCategoryValue,
} from '#billing/schemas';
import type { EncounterStatusValue } from '#emr/schemas';

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

export type ListServiceTariffsParams = {
  page: number;
  limit: number;
  category?: ServiceTariffCategoryValue;
  isActive?: boolean;
  search?: string;
};

export type CreateServiceTariffRecordPayload = {
  code: string;
  name: string;
  category: ServiceTariffCategoryValue;
  icd9cmCode?: string;
  price: number;
  isActive: boolean;
};

export type UpdateServiceTariffRecordPayload = {
  id: string;
  name?: string;
  category?: ServiceTariffCategoryValue;
  icd9cmCode?: string | null;
  price?: number;
  isActive?: boolean;
};

export type InvoiceRelatedPatientRecord = {
  id: string;
  mrn: string;
  fullName: string;
  ownerUserId: string | null;
};

export type InvoiceWithRelationsRecord = InvoiceRecord & {
  patient: InvoiceRelatedPatientRecord;
  _count: { items: number };
};

export type InvoiceDetailRecord = InvoiceRecord & {
  patient: InvoiceRelatedPatientRecord;
  items: InvoiceItemRecord[];
  payment: PaymentRecord | null;
};

export type ListInvoicesParams = {
  page: number;
  limit: number;
  status?: InvoiceStatusValue;
  patientId?: string;
  encounterId?: string;
  createdFrom?: Date;
  createdTo?: Date;
};

/**
 * What invoice generation reads off the visit: the coded procedures to price
 * against tariffs, and the quantities actually handed over the pharmacy
 * counter — billed from dispense records, not the prescription, because a
 * partially dispensed prescription must not bill the undelivered rest.
 */
export type BillingSourceEncounterRecord = {
  id: string;
  status: EncounterStatusValue;
  patientId: string;
  procedures: Array<{ id: string; code: string; display: string }>;
};

export type BillingDispensedItemRecord = {
  medicationId: string;
  quantity: number;
  medication: {
    id: string;
    name: string;
    unitPrice: number | null;
  };
};

export type CreateInvoiceItemPayload = {
  itemType: InvoiceItemTypeValue;
  serviceTariffId?: string;
  medicationId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type CreateInvoiceRecordPayload = {
  encounterId: string;
  patientId: string;
  createdById: string;
  invoiceDate: Date;
  totalAmount: number;
  items: CreateInvoiceItemPayload[];
};

export type RecordPaymentRecordPayload = {
  invoiceId: string;
  method: PaymentMethodValue;
  amount: number;
  referenceNumber?: string;
  notes?: string;
  paidAt: Date;
  cashierId: string;
};

export type VoidInvoiceRecordPayload = {
  id: string;
  voidedAt: Date;
  voidReason: string;
  voidedById: string;
};

export type InvoiceNumberAllocationRow = {
  allocated: number;
};
