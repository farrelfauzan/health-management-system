import type {
  FakturTransactionCodeValue,
  IncomeTaxRegimeValue,
  NpwpStatusValue,
  PpnTreatmentValue,
  TaxAssignmentKindValue,
  TaxCodeSourceValue,
  TaxDefaultTargetValue,
  TaxPriceBreakdownStatusValue,
  TaxReportKindValue,
  TaxReportStatusValue,
  TaxpayerTypeValue,
} from '#taxes/schemas';
import type {
  ClinicianTaxIdentifier,
  CoretaxExportIssue,
  CoretaxTemplateSource,
  CoretaxFakturExportIssue,
  CoretaxFakturTemplateSource,
  TaxReportDifference,
  TaxReportLine,
  TaxReportSummary,
} from '#taxes/types';

/**
 * The clinic's tax profile (P27-T02). `npwp` is read from the clinic profile,
 * which owns it; the rest is this record's. `pp55LastEligibleYear` is computed,
 * `null` for a regime with no end year or when the clinic is not on PP 55.
 */
export type TaxSettingsView = {
  taxpayerType?: TaxpayerTypeValue;
  incomeTaxRegime: IncomeTaxRegimeValue;
  pp55StartYear?: number;
  pp55LastEligibleYear?: number;
  isPkp: boolean;
  pkpSince?: string;
  nitku?: string;
  npwp?: string;
  npwpStatus: NpwpStatusValue;
  updatedById?: string;
  updatedAt?: string;
};

/**
 * One rate of a tax code (P27-T03). `effectiveRatePercent` is
 * `ratePercent × dppNumerator / dppDenominator`, rounded to four decimals —
 * 11 for 12% × 11/12.
 */
export type TaxCodeRateView = {
  id: string;
  ratePercent: number;
  dppNumerator: number;
  dppDenominator: number;
  effectiveRatePercent: number;
  effectiveFrom: string;
};

/**
 * A tax code with its rates. `currentRate` is the one in force today in the
 * clinic's timezone; a later-dated row is listed but not yet current.
 */
export type TaxCodeView = {
  id: string;
  code: string;
  name: string;
  ppnTreatment: PpnTreatmentValue;
  fakturTransactionCode?: FakturTransactionCodeValue;
  invoiceNote?: string;
  /** Coretax faktur fields (P27-T09): item code, `UM.xxxx` unit, and a kode-08 code's facility. */
  coretaxItemCode?: string;
  coretaxUnitCode?: string;
  coretaxAdditionalInfo?: string;
  coretaxFacilityStamp?: string;
  isSystem: boolean;
  isActive: boolean;
  currentRate?: TaxCodeRateView;
  rates: TaxCodeRateView[];
  defaultTargets: TaxDefaultTargetValue[];
  overrideCount: number;
};

export type TaxCategoryDefaultView = {
  target: TaxDefaultTargetValue;
  taxCodeId?: string;
  taxCode?: string;
};

/** A tax code as it appears on an assignment row. */
export type TaxCodeSummaryView = {
  id: string;
  code: string;
  name: string;
  ppnTreatment: PpnTreatmentValue;
};

/** One tariff or medication on the assignment screen, with the code it is taxed under. */
export type TaxAssignmentRowView = {
  kind: TaxAssignmentKindValue;
  id: string;
  code: string;
  name: string;
  category?: string;
  price?: number;
  source: TaxCodeSourceValue;
  effectiveTaxCode?: TaxCodeSummaryView;
  /** Coretax item code and unit in effect (P27-T09): the item's own, else its tax code's. */
  coretaxItemCode?: string;
  coretaxUnitCode?: string;
  /** Whether those come from the item itself rather than its tax code. */
  hasCoretaxOverride: boolean;
};

export type TaxAssignmentsListMeta = {
  page: number;
  limit: number;
  total: number;
  /** Across every active item, not just this page: how many resolve to no code. */
  unresolvedCount: number;
};

export type BulkAssignTaxCodeResult = {
  updatedCount: number;
};

/**
 * One tariff or medicine price split into the part before PPN and the PPN
 * inside it (P27-T04), at today's rate. Administrators only: the patient sees
 * the price and "Harga sudah termasuk PPN", nothing more.
 */
export type TaxPriceBreakdownView = {
  kind: TaxAssignmentKindValue;
  id: string;
  status: TaxPriceBreakdownStatusValue;
  taxCode?: string;
  ppnTreatment?: PpnTreatmentValue;
  /** What the patient pays: the stored price, tax included. */
  price?: number;
  priceBeforeTax?: number;
  taxAmount?: number;
};

/**
 * A monthly tax report draft (P27-T05). `differences` compares the stored
 * totals with the books as they are now: empty while they agree, and never
 * written back — a finalized report is what was filed.
 */
export type TaxReportView = {
  id: string;
  period: string;
  kind: TaxReportKindValue;
  status: TaxReportStatusValue;
  summary: TaxReportSummary;
  lines: TaxReportLine[];
  generatedAt: string;
  generatedById?: string;
  finalizedAt?: string;
  finalizedById?: string;
  isOutOfDate: boolean;
  differences: TaxReportDifference[];
};

/** One month's report in the year grid, without its lines. */
export type TaxReportListItem = {
  id: string;
  period: string;
  kind: TaxReportKindValue;
  status: TaxReportStatusValue;
  /** The headline figure: PPh final due, or output PPN. */
  taxDue: number;
  isOutOfDate: boolean;
};

/** Which reports the clinic's tax profile calls for, so the grid shows only those rows. */
export type TaxReportsListMeta = {
  year: number;
  applicableKinds: TaxReportKindValue[];
};

/**
 * The full NPWP or NIK of every clinician on a PPh 21 report (P27-T07), for
 * the BP21. A separate, audited read: the report itself carries only masked
 * identities. A clinician with neither is absent here and flagged there.
 */
export type TaxReportIdentifiersView = {
  reportId: string;
  period: string;
  clinicians: ClinicianTaxIdentifier[];
};

/** A signed link to a finalized report's stored PDF (P27-T12). */
export type TaxReportPdfDownloadView = {
  url: string;
  fileName: string;
  expiresAt: string;
};

/**
 * Whether a finalized report can be exported as a Coretax XML file yet
 * (P27-T08), checked before the download so every problem is listed at once,
 * per clinician. `template` names the DJP template the file follows.
 */
export type CoretaxExportValidationView = {
  reportId: string;
  period: string;
  template: CoretaxTemplateSource;
  isExportable: boolean;
  lineCount: number;
  skippedCount: number;
  issues: CoretaxExportIssue[];
};

/**
 * Whether a finalized PPN keluaran report can be exported as a Coretax
 * Faktur Keluaran XML file yet (P27-T09), every problem listed per invoice.
 * `digunggungCount` invoices have a patient without NIK and are left out.
 */
export type CoretaxFakturValidationView = {
  reportId: string;
  period: string;
  template: CoretaxFakturTemplateSource;
  isExportable: boolean;
  fakturCount: number;
  digunggungCount: number;
  issues: CoretaxFakturExportIssue[];
};
