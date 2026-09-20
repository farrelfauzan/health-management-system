import type {
  CreateTaxCodeRateInput,
  FakturTransactionCodeValue,
  IncomeTaxRegimeValue,
  PpnTreatmentValue,
  TaxAssignmentKindValue,
  TaxCodeSourceValue,
  TaxDefaultTargetValue,
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
