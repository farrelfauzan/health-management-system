import type {
  InvoiceDocumentStatusValue,
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
  /**
   * Vaccinations given on the visit (P10-T16). Priced from a `ServiceTariff`
   * matched on the vaccine's catalog code, the way a procedure is priced from
   * one matched on its ICD-9-CM code — an administered vaccine is a billable
   * act, not a dispensed product, and never crosses the pharmacy counter.
   */
  immunizations: Array<{ id: string; medicationCode: string; medicationName: string }>;
};

/**
 * One dispensed line to bill. A product line carries `medication`; a compound
 * line carries `compound` instead and is priced from its ingredients plus a
 * compounding fee, because there is no single catalog price to read and a
 * clinic that sold a puyer sold labour as well as substance (P10-T18).
 */
export type BillingDispensedItemRecord = {
  medicationId: string | null;
  quantity: number;
  medication: {
    id: string;
    name: string;
    unitPrice: number | null;
  } | null;
  compound: {
    prescriptionItemId: string;
    name: string;
    components: Array<{
      medicationId: string;
      name: string;
      quantityPerCompound: number;
      unitPrice: number | null;
    }>;
  } | null;
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

export type AddInvoiceItemRecordPayload = {
  invoiceId: string;
  item: CreateInvoiceItemPayload;
};

export type RemoveInvoiceItemRecordPayload = {
  invoiceId: string;
  itemId: string;
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

/**
 * One token the resolver could not fill (`P16-T04`).
 *
 * Warnings exist so a missing value is *visible* rather than silent. An
 * invoice that renders a blank where the doctor's name should be is a
 * document somebody has to explain; the warning is what lets the render
 * service record why, and what `P16-T12`'s preview shows an admin before they
 * publish a template that depends on a field their clinic never fills.
 */
export type TemplateVariableWarning = {
  readonly token: string;
  readonly reason: string;
};

/**
 * Everything `resolveInvoiceVariables` needs, assembled by its caller.
 *
 * The resolver is pure, so nothing here is fetched: the render service
 * (`P16-T06`) reads the invoice, the clinic profile, the encounter and the
 * stay, decrypts what it is allowed to, and hands the result over. That is
 * what keeps the resolver testable against fixtures and keeps the decision
 * about *which* patient identifiers may be read where it belongs — behind the
 * permission guard, not inside a formatter.
 *
 * Every field is nullable because a real invoice is routinely missing most of
 * them: an outpatient bill has no admission, an unpaid one has no payment,
 * and a clinic that has not filled in its licence number still prints
 * receipts.
 */
export type ResolveInvoiceVariablesParams = {
  /** IANA zone the clinic's dates are formatted in, e.g. `Asia/Jakarta`. */
  readonly timeZone: string;
  readonly clinic: ResolveInvoiceClinicInput | null;
  readonly invoice: ResolveInvoiceInput;
  readonly patient: ResolveInvoicePatientInput | null;
  readonly encounter: ResolveInvoiceEncounterInput | null;
  readonly admission: ResolveInvoiceAdmissionInput | null;
  readonly payment: ResolveInvoicePaymentInput | null;
  readonly items: readonly ResolveInvoiceItemInput[];
};

export type ResolveInvoiceClinicInput = {
  readonly name: string | null;
  readonly legalName: string | null;
  readonly address: string | null;
  readonly phoneNumber: string | null;
  readonly email: string | null;
  readonly licenseNumber: string | null;
  readonly taxId: string | null;
  /** Already inlined as a `data:` URI — the renderer fetches nothing. */
  readonly logoDataUri: string | null;
};

export type ResolveInvoiceInput = {
  readonly invoiceNumber: string;
  readonly status: string;
  readonly totalAmount: number;
  readonly issuedAt: Date | null;
  readonly qrVerifyDataUri: string | null;
};

/**
 * `nik` is the plaintext identifier and the resolver's only use for it is to
 * mask it. No token exposes it, and nothing the resolver returns contains it.
 */
export type ResolveInvoicePatientInput = {
  readonly fullName: string | null;
  readonly mrn: string | null;
  readonly dateOfBirth: Date | null;
  readonly sex: string | null;
  readonly address: string | null;
  readonly phoneNumber: string | null;
  readonly nik: string | null;
};

export type ResolveInvoiceEncounterInput = {
  readonly date: Date | null;
  readonly doctorName: string | null;
  readonly specialty: string | null;
};

export type ResolveInvoiceAdmissionInput = {
  readonly roomLabel: string | null;
  readonly nights: number | null;
};

export type ResolveInvoicePaymentInput = {
  readonly method: string | null;
  readonly paidAt: Date | null;
  readonly referenceNumber: string | null;
  readonly cashierName: string | null;
};

export type ResolveInvoiceItemInput = {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
};

/**
 * The resolved template context.
 *
 * `values` is keyed by registry token and every value is a display string —
 * a template substitutes text, so a number that reached the renderer as a
 * number would be formatted by whatever happened to stringify it. `items` is
 * one map per invoice line, keyed by the `item.*` tokens, because the
 * repeating block renders rows rather than a single value.
 *
 * A token that could not be filled is present and **empty**, never the raw
 * token: `{{patient.phone}}` printed on a receipt is worse than a blank,
 * because a blank reads as "not recorded" and the token reads as broken
 * software.
 */
export type ResolvedInvoiceVariables = {
  readonly values: Readonly<Record<string, string>>;
  readonly items: ReadonlyArray<Readonly<Record<string, string>>>;
  readonly warnings: readonly TemplateVariableWarning[];
};

/** The VOID overlay the document builder stamps on a cancelled bill. */
export type InvoiceDocumentWatermark = {
  readonly isVoid: boolean;
  readonly reason: string | null;
  readonly voidedByName: string | null;
};

/**
 * One rendered-document row as the repository returns it (`P16-T06`).
 * `renderedData` is the persisted `ResolvedInvoiceVariables` snapshot; the
 * repository parses the Json column back into that shape at the Prisma
 * boundary.
 */
export type InvoiceDocumentRecord = {
  id: string;
  invoiceId: string;
  templateVersionId: string | null;
  hasVoidWatermark: boolean;
  wasBoundRetroactively: boolean;
  renderedData: ResolvedInvoiceVariables;
  status: InvoiceDocumentStatusValue;
  storageKey: string | null;
  checksum: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  renderWarnings: TemplateVariableWarning[];
  renderError: string | null;
  renderedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateInvoiceDocumentRecordPayload = {
  invoiceId: string;
  templateVersionId: string | null;
  hasVoidWatermark: boolean;
  wasBoundRetroactively: boolean;
  renderedData: ResolvedInvoiceVariables;
  renderWarnings: TemplateVariableWarning[];
};

export type CompleteInvoiceDocumentRenderPayload = {
  id: string;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  pageCount: number | null;
  renderedAt: Date;
};

/**
 * Everything one render needs, fetched in a single repository read. Patient
 * identifiers stay masked at the source: `nikLast4` is the only identifier
 * column read — the ciphertext is never fetched, so the render path holds no
 * plaintext NIK at any point.
 */
export type InvoiceRenderContextRecord = {
  invoice: InvoiceRecord;
  items: InvoiceItemRecord[];
  patient: {
    fullName: string;
    mrn: string;
    dateOfBirth: Date | null;
    sex: string | null;
    address: string | null;
    phoneNumber: string | null;
    nikLast4: string | null;
  } | null;
  encounter: {
    startedAt: Date;
    doctorName: string | null;
    specialtyName: string | null;
  } | null;
  admission: {
    admittedAt: Date;
    dischargedAt: Date | null;
    roomLabel: string | null;
  } | null;
  payment: {
    method: PaymentMethodValue;
    paidAt: Date;
    referenceNumber: string | null;
    cashierName: string | null;
  } | null;
  voidedByName: string | null;
};

/**
 * What a send needs to know about an invoice (`P16-T25`, FR-E4-02): the
 * bill's state, the latest live rendered snapshot, and the patient fields the
 * gate and the password resolver read. A projection for the delivery
 * module, exposed through `InvoiceDocumentService` so the rule "ISSUED or
 * PAID, and READY" is applied by the module that owns sending, on facts
 * supplied by the module that owns money.
 */
export type InvoiceDeliverySubjectRecord = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: InvoiceStatusValue;
    patientId: string;
    totalAmount: number;
    issuedAt: Date | null;
  };
  document: {
    id: string;
    status: InvoiceDocumentStatusValue;
    storageKey: string | null;
  } | null;
  patient: {
    id: string;
    mrn: string;
    fullName: string;
    dateOfBirth: Date | null;
    phoneNumber: string;
    email: string | null;
  };
};
