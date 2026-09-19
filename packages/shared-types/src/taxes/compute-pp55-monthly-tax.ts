import { PP55_INDIVIDUAL_NON_TAXABLE_OMZET, PP55_RATE_PERCENT } from '#taxes/schemas';
import type { ComputePp55MonthlyTaxParams, Pp55MonthlyTax } from '#taxes/types';

const PERCENT = 100;

/**
 * The PPh final 0.5% for one month (PP 55/2022 as amended by PP 20/2026,
 * P27-T05). An individual taxpayer pays nothing on the first Rp500 juta of the
 * year (Pasal 60(2)), so the month is taxed only on the part of its omzet that
 * lies above that line, counting what was paid earlier in the year. A PT
 * perorangan is a badan and gets no allowance. Rounded to whole rupiah.
 */
export function computePp55MonthlyTax(params: ComputePp55MonthlyTaxParams): Pp55MonthlyTax {
  const allowance = params.taxpayerType === 'INDIVIDUAL' ? PP55_INDIVIDUAL_NON_TAXABLE_OMZET : 0;
  const before = params.yearToDateOmzetBefore;
  const after = before + params.monthOmzet;
  const taxableOmzet = Math.max(0, after - allowance) - Math.max(0, before - allowance);
  return {
    nonTaxableAllowanceUsed: params.monthOmzet - taxableOmzet,
    taxableOmzet,
    taxDue: Math.round((taxableOmzet * PP55_RATE_PERCENT) / PERCENT),
  };
}
