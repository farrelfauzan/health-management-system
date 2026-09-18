import type {
  IncomeTaxRegimeValue,
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
  pricesIncludeTax: boolean;
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
  pricesIncludeTax: boolean;
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
