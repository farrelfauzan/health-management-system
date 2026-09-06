import type { RoomClassSummary } from '#room-management/contracts';
import type {
  InvoiceDocumentStatusValue,
  InvoiceItemTypeValue,
  InvoiceStatusValue,
  PaymentMethodValue,
  ServiceTariffCategoryValue,
} from '#billing/schemas';
import type { TemplateVariableWarning } from '#billing/types';

export type ServiceTariffResponse = {
  id: string;
  code: string;
  name: string;
  category: ServiceTariffCategoryValue;
  icd9cmCode?: string;
  /** Present exactly on ACCOMMODATION rows, which price a ward class. */
  roomClassId?: string;
  roomClass?: RoomClassSummary;
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
  /** Absent on an inpatient bill; exactly one of the two ids is present. */
  encounterId?: string;
  admissionId?: string;
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
  | 'UNPRICED_MEDICATION'
  | 'NO_ACCOMMODATION_TARIFF'
  | 'NO_TARIFF_FOR_IMMUNIZATION';

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

/**
 * What discharging a stay did to the cashier's side of it (IMP-15).
 *
 * `invoiceId` is absent when the stay produced no billable night — a same-day
 * admit and discharge crosses no midnight — or when no ward class the patient
 * occupied has a live tariff. Either way the `gaps` say so: an inpatient bill
 * that quietly omits three nights in a VIP room reads as "nothing to charge"
 * when it is really "nobody priced the VIP room".
 */
export type AdmissionRoomChargeResult = {
  invoiceId?: string;
  invoiceNumber?: string;
  totalAmount: number;
  nights: number;
  gaps: InvoiceGenerationGap[];
};

/**
 * The clinic's identity as an API consumer sees it (P16-T02).
 *
 * `logoUrl` is a **short-lived signed GET minted for this response**, never
 * the stored value (D-018). It is absent when no logo is configured, and it
 * must not be cached, persisted, or handed to anyone the request was not
 * answering — it expires on the storage layer's own schedule and is a bearer
 * credential until it does.
 */
export type ClinicProfileView = {
  name: string;
  legalName: string | null;
  address: string | null;
  phoneNumber: string | null;
  email: string | null;
  licenseNumber: string | null;
  taxId: string | null;
  hasLogo: boolean;
  logoUrl?: string;
  updatedAt: string;
};

/**
 * One signed browser-direct logo upload. `requiredHeaders` must be sent
 * verbatim on the PUT — they are part of the signature, so a client that
 * changes the declared type or length is rejected by the provider rather than
 * quietly storing something else.
 */
export type ClinicLogoUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

/**
 * The rendered-document metadata an invoice exposes (P16-T06). `warnings`
 * carries every token the resolver could not fill plus pipeline-level notes
 * (fallback layout used, logo unreadable) — a blank on the receipt is always
 * accounted for here. `wasBoundRetroactively` marks a pre-Phase-16 invoice
 * whose snapshot was cut at first render request rather than at issue; the
 * download surface states it rather than hiding it.
 */
export type InvoiceDocumentView = {
  id: string;
  invoiceId: string;
  status: InvoiceDocumentStatusValue;
  templateVersionId?: string;
  hasVoidWatermark: boolean;
  wasBoundRetroactively: boolean;
  checksum?: string;
  sizeBytes?: number;
  pageCount?: number;
  warnings: TemplateVariableWarning[];
  renderError?: string;
  renderedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * A short-lived signed download for the stored PDF. The URL is minted per
 * request and never persisted (D-018); `fileName` is what the disposition
 * header pins, `INV-<compact invoice number>.pdf`.
 */
export type InvoiceDocumentDownloadView = {
  url: string;
  fileName: string;
  expiresAt: string;
};
