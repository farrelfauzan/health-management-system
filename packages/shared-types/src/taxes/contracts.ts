import type {
  FakturTransactionCodeValue,
  IncomeTaxRegimeValue,
  NpwpStatusValue,
  PpnTreatmentValue,
  TaxAssignmentKindValue,
  TaxCodeSourceValue,
  TaxDefaultTargetValue,
  TaxPriceBreakdownStatusValue,
  TaxpayerTypeValue,
} from '#taxes/schemas';

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
