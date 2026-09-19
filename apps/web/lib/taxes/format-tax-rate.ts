import type { TaxCodeRateView } from '@hms/shared-types';

/**
 * A rate as an administrator reads it: `12% × 11/12 = 11%`, or just `11%` when
 * the whole price is the base. Indonesian decimal comma.
 */
export function formatTaxRate(rate: TaxCodeRateView): string {
  const percent = (value: number): string => `${value.toLocaleString('id-ID')}%`;
  if (rate.dppNumerator === rate.dppDenominator) {
    return percent(rate.ratePercent);
  }
  return `${percent(rate.ratePercent)} × ${rate.dppNumerator}/${rate.dppDenominator} = ${percent(rate.effectiveRatePercent)}`;
}
