import type {
  InvoiceItemTypeValue,
  InvoiceStatusValue,
  PaymentMethodValue,
  ServiceTariffCategoryValue,
} from '#billing/schemas';

export type ServiceTariffResponse = {
  id: string;
  code: string;
  name: string;
  category: ServiceTariffCategoryValue;
  icd9cmCode?: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServiceTariffsListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * One billed line as the API returns it. `description`, `unitPrice`, and
 * `amount` are the snapshot that was billed; the id fields are provenance
 * only and go absent if the catalog row is ever removed.
 */
export type InvoiceItemResponse = {
  id: string;
  itemType: InvoiceItemTypeValue;
  serviceTariffId?: string;
  medicationId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type PaymentResponse = {
  id: string;
  invoiceId: string;
  method: PaymentMethodValue;
  amount: number;
  referenceNumber?: string;
  notes?: string;
  paidAt: string;
  cashierId: string;
  createdAt: string;
};

export type InvoiceRelatedPatient = {
  id: string;
  mrn: string;
  fullName: string;
};

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  encounterId: string;
  patientId: string;
  patient: InvoiceRelatedPatient;
  status: InvoiceStatusValue;
  totalAmount: number;
  itemCount: number;
  issuedAt?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceDetail = Omit<InvoiceListItem, 'itemCount'> & {
  items: InvoiceItemResponse[];
  payment?: PaymentResponse;
  voidReason?: string;
  voidedById?: string;
  createdById?: string;
};

export type InvoicesListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type InvoiceGenerationGapReason =
  | 'NO_CONSULTATION_TARIFF'
  | 'NO_TARIFF_FOR_PROCEDURE'
  | 'UNPRICED_MEDICATION';

/**
 * A billable thing the generator found on the encounter but could not price.
 * Gaps are reported, never silently dropped: an invoice that quietly omits a
 * procedure reads as "covered everything" when it did not.
 */
export type InvoiceGenerationGap = {
  reason: InvoiceGenerationGapReason;
  description: string;
  code?: string;
};

export type CashierReportTotals = {
  count: number;
  totalAmount: number;
};

export type CashierReportMethodLine = CashierReportTotals & {
  method: PaymentMethodValue;
};

export type CashierReportDoctorLine = CashierReportTotals & {
  doctorId: string;
  doctorName: string;
};

/**
 * One clinic day at the cash drawer: what was settled, split the two ways a
 * clinic owner actually asks for — by payment method (does the drawer
 * reconcile?) and by doctor (who produced the revenue?). Built from payments,
 * so voided and unpaid invoices never appear in it.
 */
export type CashierDailyReport = {
  date: string;
  totals: CashierReportTotals;
  byMethod: CashierReportMethodLine[];
  byDoctor: CashierReportDoctorLine[];
};
