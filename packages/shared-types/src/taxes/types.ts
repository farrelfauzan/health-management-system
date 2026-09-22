import type { InvoiceItemTypeValue } from '#billing/schemas';
import type { ClinicLetterhead } from '#billing/types';
import type {
  ClinicianProfessionValue,
  ClinicianPtkpStatusValue,
} from '#doctor-management/schemas';
import type { CoretaxBp21IssueCodeValue } from '#taxes/coretax-bp21';
import type {
  ClinicianTaxIdentityKindValue,
  ClinicianTaxIdentityStatusValue,
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

/**
 * One Pasal 17(1)(a) bracket as the repository returns it (P27-T07). Bounds
 * are rupiah of taxable base: `lowerBound` inclusive, `upperBound` exclusive
 * and `null` for the open top bracket. Rows sharing an `effectiveFrom` form
 * one bracket set; the set in force on a date is the latest one that starts
 * on or before it.
 */
export type Pph21TaxBracketRecord = {
  id: string;
  /** Calendar date, `YYYY-MM-DD`. */
  effectiveFrom: string;
  lowerBound: number;
  upperBound: number | null;
  ratePercent: number;
};

export type ResolvePph21BracketSetParams = {
  brackets: readonly Pph21TaxBracketRecord[];
  /** Calendar date in the clinic's timezone, `YYYY-MM-DD`. */
  onDate: string;
};

/** The bracket set in force on a date, lowest bracket first; empty when none has started yet. */
export type Pph21BracketSet = {
  effectiveFrom: string | null;
  brackets: Pph21TaxBracketRecord[];
};

export type ComputePph21NonEmployeeParams = {
  /** The clinician's gross fee for the period, in rupiah. */
  grossFee: number;
  brackets: readonly Pph21TaxBracketRecord[];
};

/** How much of the base fell in one bracket and what it cost. */
export type Pph21BracketSlice = {
  lowerBound: number;
  upperBound: number | null;
  ratePercent: number;
  taxableAmount: number;
  taxAmount: number;
};

/** PPh 21 on one clinician's month, non-cumulative: the base is this month's alone. */
export type Pph21NonEmployeeTax = {
  grossFee: number;
  dppPercent: number;
  taxBase: number;
  slices: Pph21BracketSlice[];
  taxAmount: number;
};

/**
 * A clinician's tax identity as the withholding draft reads it (P27-T07):
 * the NPWP when one is stored, else the NIK, which serves as NPWP (Coretax);
 * the number itself stays masked here — the draft is stored as JSON and the
 * PDF as a file, and neither may hold a plaintext NIK.
 */
export type ClinicianTaxIdentityRecord = {
  doctorId: string;
  fullName: string;
  profession: ClinicianProfessionValue;
  npwp: string | null;
  nikLast4: string | null;
};

/** The full identifier, produced only by the repository's explicit unmask query, and audited. */
export type ClinicianTaxIdentifierRecord = {
  doctorId: string;
  npwp: string | null;
  nik: string | null;
};

export type ResolveClinicianTaxIdentityParams = {
  npwp: string | null;
  nikLast4: string | null;
};

/** Which identity a BP21 line would carry, with its masked display form. */
export type ClinicianTaxIdentity = {
  status: ClinicianTaxIdentityStatusValue;
  /** `••••••••1234` or the NPWP; absent when there is nothing to show. */
  masked: string | null;
};

/** One clinician's summed gross fee for the period, as the ledger reads it. */
export type Pph21SourceClinicianFee = {
  doctorId: string;
  entryCount: number;
  /** Sum of the line amounts the fees were taken from, carried for the §6 hook. */
  lineAmount: number;
  grossFee: number;
};

/**
 * One clinician's BP21 line for the month (P27-T07). `identityStatus` is
 * `MISSING` when the clinician has neither NPWP nor NIK: the line stays on
 * the draft, flagged, and blocks finalization.
 */
export type Pph21ReportLine = {
  doctorId: string;
  doctorName: string;
  profession: ClinicianProfessionValue;
  identityStatus: ClinicianTaxIdentityStatusValue;
  identityMasked: string | null;
  entryCount: number;
  lineAmount: number;
  grossFee: number;
  taxBase: number;
  slices: Pph21BracketSlice[];
  taxAmount: number;
};

/**
 * The PPh 21 bukan pegawai draft for one month (P27-T07): one BP21 per
 * clinician on the jasa medis ledger. `bracketsEffectiveFrom` names the
 * bracket set the month was taxed under.
 */
export type Pph21ReportSummary = {
  kind: 'PPH21_NON_EMPLOYEE';
  dppPercent: number;
  bracketsEffectiveFrom: string;
  clinicianCount: number;
  incompleteIdentityCount: number;
  totals: { grossFee: number; taxBase: number; taxAmount: number };
  taxAccountCode: string;
  depositTypeCode: string;
  paymentDueDate: string;
  reportingDueDate: string;
};

export type TaxReportSummary = Pp55ReportSummary | PpnOutputReportSummary | Pph21ReportSummary;

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

export type TaxReportLine = Pp55ReportLine | PpnOutputReportLine | Pph21ReportLine;

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

export type SummarizePph21WithholdingParams = {
  fees: readonly Pph21SourceClinicianFee[];
  identities: readonly ClinicianTaxIdentityRecord[];
  bracketSet: Pph21BracketSet & { effectiveFrom: string };
  dueDates: TaxReportDueDates;
};

export type SummarizedPph21Withholding = {
  summary: Pph21ReportSummary;
  lines: Pph21ReportLine[];
};

/** A clinician's BP21 identity with the full number, for the audited reveal and the CSV. */
export type ClinicianTaxIdentifier = {
  doctorId: string;
  identityKind: ClinicianTaxIdentityKindValue;
  taxIdentityNumber: string;
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

/** Which statutory obligation a due date belongs to (P27-T10). */
export type TaxObligationCode =
  | 'PP55_INCOME_TAX_DEPOSIT'
  | 'PPN_DEPOSIT_AND_RETURN'
  | 'PPH21_WITHHOLDING_DEPOSIT'
  | 'WITHHOLDING_RETURN_PPH_21_26'
  | 'WITHHOLDING_RETURN_UNIFICATION'
  | 'ANNUAL_RETURN_INDIVIDUAL'
  | 'ANNUAL_RETURN_ENTITY';

/**
 * One obligation falling due on one date (P27-T10).
 *
 * `reportKind` is the draft whose FINALIZED status silences the reminder, and
 * null for an obligation this repository does not report on — a withholding
 * return has no draft here, so its date is calendar information rather than
 * something to chase a clinic about.
 */
export type TaxObligationDueDate = {
  obligation: TaxObligationCode;
  /** `YYYY-MM-DD`, the statutory date with no working-day shift applied. */
  dueDate: string;
  reportKind: TaxReportKindValue | null;
};

/** One reminder a sweep decided to raise, before it has been claimed. */
export type DueTaxReminder = {
  obligation: TaxObligationCode;
  /** `YYYY-MM` for a monthly obligation, `YYYY` for an annual one. */
  period: string;
  dueDate: string;
  leadDays: number;
};

/** A DJP bulk-import template a Coretax export follows, and where it was obtained (P27-T08). */
export type CoretaxTemplateSource = {
  format: 'BP21';
  version: string;
  title: string;
  /** The date DJP's catalogue gives for this version, `YYYY-MM-DD`. */
  publishedOn: string;
  sourceUrl: string;
  /** pajak.go.id node 112031, the converter catalogue. */
  catalogueUrl: string;
  sha256: string;
};

/**
 * One `Bp21` element, in the order and units of the v4 schema (P27-T08).
 * Amounts are rupiah; `deemedPercent` and `ratePercent` are percentages, as
 * the template's `Deemed` and `Rate` columns are. Dates are `YYYY-MM-DD`.
 */
export type CoretaxBp21Line = {
  doctorId: string;
  taxPeriodMonth: number;
  taxPeriodYear: number;
  counterpartTin: string;
  recipientPlaceOfBusinessId: string;
  ptkpLabel: string;
  taxCertificate: string;
  taxObjectCode: string;
  gross: number;
  deemedPercent: number;
  ratePercent: number;
  documentType: string;
  documentNumber: string;
  documentDate: string;
  withholderPlaceOfBusinessId: string;
  withholdingDate: string;
};

/** What every line of one BP21 file shares: the period, its last day, the DPP share, the withholder. */
export type CoretaxBp21LineContext = {
  period: string;
  lastDay: string;
  deemedPercent: number;
  withholderPlaceOfBusinessId: string;
};

/** The whole `Bp21Bulk` file: the withholder's NPWP and one line per clinician. */
export type CoretaxBp21Document = {
  withholderTin: string;
  lines: CoretaxBp21Line[];
};

/** A clinician's BP21 identity and PTKP status, read from the profile for the export. */
export type CoretaxBp21ClinicianSource = {
  doctorId: string;
  /** Full NPWP, else the NIK serving as NPWP; `null` when neither is on file. */
  taxIdentityNumber: string | null;
  ptkpStatus: ClinicianPtkpStatusValue | null;
};

export type BuildCoretaxBp21DocumentParams = {
  report: TaxReportRecord;
  clinicNpwp: string | null;
  clinicNitku: string | null;
  clinicians: readonly CoretaxBp21ClinicianSource[];
};

/** A file ready to serialize, or the problems that stop it; never both. */
export type BuiltCoretaxBp21Document = {
  document: CoretaxBp21Document | null;
  issues: CoretaxExportIssue[];
  /** Lines left out because the month's gross is exactly zero: no BP21 is due. */
  skippedDoctorIds: string[];
};

/** One reason a Coretax file cannot be produced yet; `subjectId` is the clinician's, if any. */
export type CoretaxExportIssue = {
  code: CoretaxBp21IssueCodeValue;
  field: string;
  message: string;
  subjectId?: string;
  subjectLabel?: string;
};

/** A Coretax XML file ready to stream. */
export type CoretaxXmlExport = { fileName: string; xml: string };

/** Writes a BP21 document as one template version's XML, byte for byte as DJP's converter does. */
export type CoretaxBp21XmlSerializer = (document: CoretaxBp21Document) => string;
