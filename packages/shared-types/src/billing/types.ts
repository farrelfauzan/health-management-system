import type {
  InvoiceItemTypeValue,
  InvoiceStatusValue,
  PaymentMethodValue,
  ServiceTariffCategoryValue,
} from '#billing/schemas';
import type { EncounterStatusValue } from '#emr/schemas';
import type { RoomClassSummaryRecord } from '#room-management/types';

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
  /** Set exactly for ACCOMMODATION rows, which price a ward class (IMP-15). */
  roomClass: RoomClassSummaryRecord | null;
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
  /** Null on an inpatient bill; exactly one of the two ids is set. */
  encounterId: string | null;
  admissionId: string | null;
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
  roomClassId?: string;
  price: number;
  isActive: boolean;
};

export type UpdateServiceTariffRecordPayload = {
  id: string;
  name?: string;
  category?: ServiceTariffCategoryValue;
  roomClassId?: string;
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
  admissionId?: string;
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
  /** Exactly one of these is set — the CHECK constraint says the same thing. */
  encounterId?: string;
  admissionId?: string;
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

/**
 * One settled payment as the daily report consumes it: the amount, how it was
 * paid, and the doctor whose encounter produced it (absent when the invoice's
 * encounter was hard-detached, which `RESTRICT` FKs make unreachable in
 * practice but the type stays honest about the join).
 */
export type CashierReportPaymentRecord = {
  method: PaymentMethodValue;
  amount: number;
  doctor: { id: string; fullName: string } | null;
};

export type CashierReportDayRange = {
  startInclusive: Date;
  endExclusive: Date;
};

/**
 * The clinic profile row as the repository returns it. `logoStorageKey` stays
 * a key all the way to the service — the signed URL is minted at the edge of
 * the response and nothing below the mapper ever holds one.
 */
export type ClinicProfileRecord = {
  id: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phoneNumber: string | null;
  email: string | null;
  licenseNumber: string | null;
  taxId: string | null;
  logoStorageKey: string | null;
  logoMimeType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A write into the singleton row. Every field is optional in the same
 * three-state sense the PATCH schema uses: absent leaves the column alone,
 * `null` clears it. `name` cannot be null because the table refuses a blank
 * one.
 */
export type SaveClinicProfileData = {
  name?: string;
  legalName?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  licenseNumber?: string | null;
  taxId?: string | null;
  logoStorageKey?: string | null;
  logoMimeType?: string | null;
};
