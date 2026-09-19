import type { ResolveTaxRateParams, TaxCodeRateRecord } from '#taxes/types';

/**
 * The rate in force on a calendar day: the latest one whose `effectiveFrom` is
 * not after it (P27-T03). Rates are append-only, so the day a PMK changes the
 * rate is a new row and every earlier day still reads the old one. `null`
 * before the first rate.
 */
export function resolveTaxRate(params: ResolveTaxRateParams): TaxCodeRateRecord | null {
  return params.rates.reduce<TaxCodeRateRecord | null>((current, rate) => {
    if (rate.effectiveFrom > params.onDate) {
      return current;
    }
    return current === null || rate.effectiveFrom > current.effectiveFrom ? rate : current;
  }, null);
}
