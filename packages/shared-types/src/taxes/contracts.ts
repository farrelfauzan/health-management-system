import type { IncomeTaxRegimeValue, NpwpStatusValue, TaxpayerTypeValue } from '#taxes/schemas';

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
