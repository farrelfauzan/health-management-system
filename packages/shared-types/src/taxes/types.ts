import type { InvoiceItemTypeValue } from '#billing/schemas';
import type { ClinicLetterhead } from '#billing/types';
import type {
  CreateTaxCodeRateInput,
  FakturTransactionCodeValue,
  IncomeTaxRegimeValue,
  PpnTreatmentValue,
  TaxAssignmentKindValue,
  TaxCodeSourceValue,
  TaxDefaultTargetValue,
  TaxReportKindValue,
  TaxReportDocumentStatusValue,
  TaxReportStatusValue,
  TaxpayerTypeValue,
  UpdateTaxSettingsInput,
} from '#taxes/schemas';

/** The clinic's tax profile as the repository returns it (P27-T02). */
export type TaxSettingsRecord = {
  taxpayerType: TaxpayerTypeValue | null;
  incomeTaxRegime: IncomeTaxRegimeValue;
  pp55StartYear: number | null;
  isPkp: boolean;
  /** Calendar date, `YYYY-MM-DD`. */
  pkpSince: string | null;
  nitku: string | null;
  updatedById: string | null;
  updatedAt: Date | null;
};

/** Everything a write stores, already merged with the row it replaces. */
export type SaveTaxSettingsPayload = {
  taxpayerType: TaxpayerTypeValue | null;
  incomeTaxRegime: IncomeTaxRegimeValue;
  pp55StartYear: number | null;
  isPkp: boolean;
  pkpSince: string | null;
  nitku: string | null;
  updatedById: string;
};

export type ResolvePp55EligibilityParams = {
  taxpayerType: TaxpayerTypeValue | null;
  startYear: number | null;
  /** The current year in the clinic's timezone. */
  currentYear: number;
};

/** A badan's case, once its entity type is known to carry a time limit. */
export type ResolveBadanPp55EligibilityParams = ResolvePp55EligibilityParams & {
  taxpayerType: TaxpayerTypeValue;
  taxYears: number;
};

/**
 * Whether the 0.5% final tax is open to this taxpayer this year. `reason` is a
 * sentence for the administrator when it is not; `lastEligibleYear` is `null`
 * when the scheme has no end for this entity type.
 */
export type Pp55Eligibility =
  | { isEligible: true; lastEligibleYear: number | null }
  | { isEligible: false; lastEligibleYear: number | null; reason: string };

export type ResolveTaxIdChangeParams = {
  /** What the request carried: `undefined` leaves it, `null` or `''` clears it. */
  requested: string | null | undefined;
  stored: string | null;
};

/** `unchanged` when the request names the value already stored, however it was punctuated. */
export type TaxIdChange =
  | { kind: 'unchanged' }
  | { kind: 'cleared' }
  | { kind: 'set'; value: string }
  | { kind: 'invalid'; reason: string };

/** What the tax-profile rules judge: the merged row, the request that produced it, and the NPWP. */
export type ValidateTaxSettingsParams = {
  merged: SaveTaxSettingsPayload;
  input: UpdateTaxSettingsInput;
  taxId: string | null;
};

/** One effective-dated rate as the repository returns it (P27-T03). */
export type TaxCodeRateRecord = {
  id: string;
  ratePercent: number;
  dppNumerator: number;
  dppDenominator: number;
  /** Calendar date, `YYYY-MM-DD`. */
  effectiveFrom: string;
};

/** A tax code with its full rate history, oldest first. */
export type TaxCodeRecord = {
  id: string;
  code: string;
  name: string;
  ppnTreatment: PpnTreatmentValue;
  fakturTransactionCode: FakturTransactionCodeValue | null;
  invoiceNote: string | null;
  isSystem: boolean;
  isActive: boolean;
  rates: TaxCodeRateRecord[];
};

/** Where a code is referenced, so it cannot be switched off under a price. */
export type TaxCodeUsageRecord = {
  taxCodeId: string;
  defaultTargets: TaxDefaultTargetValue[];
  overrideCount: number;
};

export type TaxCategoryDefaultRecord = {
  target: TaxDefaultTargetValue;
  taxCodeId: string;
};

export type SaveTaxCodePayload = {
  code: string;
  name: string;
  ppnTreatment: PpnTreatmentValue;
  fakturTransactionCode: FakturTransactionCodeValue | null;
  invoiceNote: string | null;
  initialRate: CreateTaxCodeRateInput | null;
  createdById: string;
};

export type UpdateTaxCodePayload = {
  name?: string;
  fakturTransactionCode?: FakturTransactionCodeValue | null;
  invoiceNote?: string | null;
  isActive?: boolean;
};

export type SaveTaxCodeRatePayload = CreateTaxCodeRateInput & {
  taxCodeId: string;
  createdById: string;
};

export type SaveTaxCategoryDefaultsPayload = {
  defaults: Array<{ target: TaxDefaultTargetValue; taxCodeId: string | null }>;
  updatedById: string;
};

/**
 * A tariff or medication as the tax assignment screen reads it: identity,
 * category, price and its own override. `category` is the tariff category, or
 * the medication's catalogue category when it has one.
 */
export type TaxAssignmentTargetRecord = {
  kind: TaxAssignmentKindValue;
  id: string;
  code: string;
  name: string;
  category: string | null;
  price: number | null;
  taxCodeId: string | null;
};

export type ResolveEffectiveTaxCodeParams = {
  overrideTaxCodeId: string | null;
  defaultTaxCodeId: string | null;
};

/** The code an item is taxed under, and why. */
export type EffectiveTaxCode =
  | { source: 'OVERRIDE' | 'CATEGORY_DEFAULT'; taxCodeId: string }
  | { source: Extract<TaxCodeSourceValue, 'UNRESOLVED'>; taxCodeId: null };

export type ResolveTaxRateParams = {
  rates: readonly TaxCodeRateRecord[];
  /** Calendar date in the clinic's timezone, `YYYY-MM-DD`. */
  onDate: string;
};

/** A faktur code judged against the treatment it would be reported under. */
export type IsFakturCodeAllowedParams = {
  ppnTreatment: PpnTreatmentValue;
  fakturTransactionCode: FakturTransactionCodeValue | null;
};

export type BulkAssignTaxCodePayload = {
  targets: Array<{ kind: TaxAssignmentKindValue; id: string }>;
  taxCodeId: string | null;
};

/** Everything the assignment screen needs to resolve an item's code at once. */
export type TaxCodeCatalog = {
  codesById: ReadonlyMap<string, TaxCodeRecord>;
  defaultCodeIdByTarget: ReadonlyMap<TaxDefaultTargetValue, string>;
};

/** One audited change to the tax-code catalog. */
export type RecordTaxCodeChangeParams = {
  operation: 'CREATE' | 'UPDATE' | 'ADD_RATE' | 'SET_DEFAULTS';
  actorUserId: string;
  metadata: Record<string, unknown>;
};

/** An item with its code resolved, before the list is filtered and paged. */
export type ResolvedTaxAssignmentTarget = TaxAssignmentTargetRecord & {
  effective: EffectiveTaxCode;
};

/** What an invoice line needs to be taxed (P27-T04): where it came from and what it costs. */
export type InvoiceLineTaxInput = {
  itemType: InvoiceItemTypeValue;
  serviceTariffId?: string | null;
  medicationId?: string | null;
  amount: number;
};

/**
 * The tax snapshot of one invoice line (P27-T04). `taxableAmount` is the price
 * before PPN, `taxBase` the DPP (DPP nilai lain for faktur code 04), and
 * `taxAmount` the PPN inside `amount` — prices are always tax-inclusive.
 * `isResolved` is false when no code or no rate applies; issue refuses those.
 */
export type InvoiceLineTax = {
  taxCode: string | null;
  ppnTreatment: PpnTreatmentValue | null;
  fakturTransactionCode: FakturTransactionCodeValue | null;
  taxableAmount: number | null;
  taxBase: number | null;
  taxRatePercent: number | null;
  taxAmount: number;
  isResolved: boolean;
};

export type ComputeLineTaxParams = {
  /** The line total the patient pays, tax included. */
  amount: number;
  taxCode: TaxCodeRecord | null;
  /** The rate in force on the invoice date, `null` if none yet. */
  rate: TaxCodeRateRecord | null;
  isPkp: boolean;
};

export type ComputeInvoiceLineTaxesParams<TLine extends InvoiceLineTaxInput> = {
  lines: readonly TLine[];
  /** Calendar date in the clinic's timezone, `YYYY-MM-DD`. */
  onDate: string;
};

/**
 * Lines with their tax attached, the PPN they add up to, and whether the
 * clinic is PKP — the only case in which an unresolved line blocks issue.
 */
export type InvoiceLineTaxesResult<TLine extends InvoiceLineTaxInput> = {
  lines: Array<TLine & { tax: InvoiceLineTax }>;
  taxAmount: number;
  isPkp: boolean;
};

/** The code overrides on the tariffs and medications an invoice's lines came from. */
export type TaxCodeOverrides = {
  byServiceTariffId: ReadonlyMap<string, string>;
  byMedicationId: ReadonlyMap<string, string>;
};

export type FindTaxCodeOverridesParams = {
  serviceTariffIds: string[];
  medicationIds: string[];
};

/** Everything one invoice line's tax is resolved from. */
export type ResolveLineTaxParams = {
  line: InvoiceLineTaxInput;
  catalog: TaxCodeCatalog;
  overrides: TaxCodeOverrides;
  isPkp: boolean;
  onDate: string;
};

/** What a price breakdown is computed from, for one item. */
export type BuildTaxPriceBreakdownParams = {
  target: TaxAssignmentTargetRecord;
  catalog: TaxCodeCatalog;
  isPkp: boolean;
  onDate: string;
};

/**
 * The PP 55 draft for one month (P27-T05). Cash basis (D-038 R6): omzet is
 * what was paid in the month. `totals` are the figures compared when checking
 * whether a finalized draft still matches the books.
 */
export type Pp55ReportSummary = {
  kind: 'PP55_OMZET';
  taxpayerType: TaxpayerTypeValue | null;
  ratePercent: number;
  paymentCount: number;
  /** Paid earlier in the same year, before this month. */
  yearToDateOmzetBefore: number;
  /** The part of the Rp500 juta individual allowance used up by this month. */
  nonTaxableAllowanceUsed: number;
  totals: { grossOmzet: number; taxableOmzet: number; taxDue: number };
  taxAccountCode: string;
  depositTypeCode: string;
  paymentDueDate: string;
  reportingDueDate: string;
};

/** One faktur code's share of a month's output VAT. */
export type PpnOutputGroup = {
  fakturTransactionCode: string;
  invoiceCount: number;
  lineCount: number;
  taxableAmount: number;
  taxBase: number;
  taxAmount: number;
};

/**
 * The PPN keluaran draft for one month (P27-T05): invoices issued in the
 * month, VOID excluded, by faktur code. Every buyer is a retail patient, so
 * the whole month is `digunggung` (PMK 81/2024). Lines billed before the tax
 * module carry no code and are counted apart rather than guessed.
 */
export type PpnOutputReportSummary = {
  kind: 'PPN_OUTPUT';
  invoiceCount: number;
  groups: PpnOutputGroup[];
  legacyLineCount: number;
  legacyAmount: number;
  notObjectLineCount: number;
  notObjectAmount: number;
  totals: { taxableAmount: number; taxBase: number; taxAmount: number };
  paymentDueDate: string;
  reportingDueDate: string;
};

export type TaxReportSummary = Pp55ReportSummary | PpnOutputReportSummary;

/** A payment counted in a PP 55 month. */
export type Pp55ReportLine = {
  paymentId: string;
  invoiceNumber: string;
  paidAt: string;
  method: string;
  amount: number;
};

/** One invoice's output VAT under one faktur code (or `LEGACY` / `NOT_OBJECT`). */
export type PpnOutputReportLine = {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: string;
  fakturTransactionCode: string;
  lineCount: number;
  taxableAmount: number;
  taxBase: number;
  taxAmount: number;
};

export type TaxReportLine = Pp55ReportLine | PpnOutputReportLine;

/** A computed report, before it is stored. */
export type ComputedTaxReport = {
  summary: TaxReportSummary;
  lines: TaxReportLine[];
};

/** A stored draft or finalized report. */
export type TaxReportRecord = {
  id: string;
  period: string;
  kind: TaxReportKindValue;
  status: TaxReportStatusValue;
  summary: TaxReportSummary;
  lines: TaxReportLine[];
  generatedAt: Date;
  generatedById: string | null;
  finalizedAt: Date | null;
  finalizedById: string | null;
};

export type SaveTaxReportPayload = ComputedTaxReport & {
  period: string;
  kind: TaxReportKindValue;
  generatedById: string;
};

export type ComputePp55MonthlyTaxParams = {
  monthOmzet: number;
  yearToDateOmzetBefore: number;
  taxpayerType: TaxpayerTypeValue | null;
};

export type Pp55MonthlyTax = {
  nonTaxableAllowanceUsed: number;
  taxableOmzet: number;
  taxDue: number;
};

/** A line of an issued invoice, as the PPN draft reads it. */
export type PpnOutputSourceLine = {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: Date;
  taxCode: string | null;
  ppnTreatment: PpnTreatmentValue | null;
  fakturTransactionCode: string | null;
  amount: number;
  taxableAmount: number | null;
  taxBase: number | null;
  taxAmount: number;
};

/** A payment, as the PP 55 draft reads it. */
export type Pp55SourcePayment = {
  paymentId: string;
  invoiceNumber: string;
  paidAt: Date;
  method: string;
  amount: number;
};

/** The instants a clinic-timezone month spans, end exclusive. */
export type TaxReportPeriodRange = { start: Date; end: Date };

export type TaxReportDueDates = { paymentDueDate: string; reportingDueDate: string };

/** One total that no longer matches the books, for a finalized report. */
export type TaxReportDifference = { field: string; stored: number; live: number };

export type SummarizePpnOutputParams = {
  lines: readonly PpnOutputSourceLine[];
  dueDates: TaxReportDueDates;
};

export type SummarizedPpnOutput = {
  summary: PpnOutputReportSummary;
  lines: PpnOutputReportLine[];
};

/** A draft or finalized report's figures after a recompute. */
export type UpdateTaxReportComputationPayload = ComputedTaxReport & {
  id: string;
  generatedById: string;
};

export type FinalizeTaxReportPayload = ComputedTaxReport & {
  id: string;
  finalizedById: string;
  finalizedAt: Date;
};

/** A report ready to download. */
export type TaxReportCsvExport = { fileName: string; csv: string };

/** A finalized report's stored PDF, as the repository returns it (P27-T12). */
export type TaxReportDocumentRecord = {
  id: string;
  reportId: string;
  status: TaxReportDocumentStatusValue;
  storageKey: string | null;
  /** SHA-256 of the stored bytes, hex. */
  checksum: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  renderedAt: Date | null;
};

export type SaveReadyTaxReportDocumentPayload = {
  reportId: string;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  renderedAt: Date;
};

export type SaveFailedTaxReportDocumentPayload = {
  reportId: string;
  failureReason: string;
};

/** Who drafted and who finalized a report, as the PDF footer names them. */
export type TaxReportActorNames = {
  generatedByName: string | null;
  finalizedByName: string | null;
};

/** Everything the PDF layout prints, gathered before it is built (P27-T12). */
export type TaxReportPdfContext = {
  report: TaxReportRecord;
  letterhead: ClinicLetterhead;
  nitku: string | null;
  actors: TaxReportActorNames;
  /** When this copy is rendered; a DRAFT prints it under its watermark. */
  renderedAt: Date;
  timeZone: string;
};

/** A rendered PDF, ready to stream. */
export type TaxReportPdf = { fileName: string; bytes: Uint8Array };

/**
 * How the tax report PDF prints values (P27-T12): Indonesian, in the clinic's
 * timezone. Handed to every section builder so all kinds read alike.
 */
export type TaxReportPdfValueFormatter = {
  /** `Rp 1.000.000`, whole rupiah. */
  rupiah: (amount: number) => string;
  /** A `YYYY-MM-DD` calendar date as `15 Oktober 2026`. */
  calendarDate: (date: string) => string;
  /** An instant as `10 Agustus 2026, 11:00` in the clinic's timezone. */
  instant: (value: Date | string) => string;
  /** A `YYYY-MM` period as `Oktober 2026`. */
  period: (period: string) => string;
};

export type BuildTaxReportPdfSectionsParams = {
  report: TaxReportRecord;
  format: TaxReportPdfValueFormatter;
};

/**
 * One report kind's part of the PDF: its title and the HTML of its summary
 * and line sections. The header, watermark and footer are shared, so a new
 * kind (PPh 21, P27-T07) adds one of these and nothing else.
 */
export type TaxReportPdfLayout = {
  title: string;
  buildSections: (params: BuildTaxReportPdfSectionsParams) => string;
};

/** A table in the PDF; cells are plain text, escaped when the table is built. */
export type TaxReportPdfTable = {
  headers: string[];
  rows: string[][];
  /** Column indexes printed right-aligned, for amounts. */
  numericColumns: number[];
  /** A bold last row, for totals. */
  totalRow?: string[];
};

/** A label and its value, as the summary blocks print them. */
export type TaxReportPdfSummaryRow = { label: string; value: string; isEmphasised?: boolean };

export type BuildTaxReportPdfHtmlParams = {
  context: TaxReportPdfContext;
  format: TaxReportPdfValueFormatter;
};
