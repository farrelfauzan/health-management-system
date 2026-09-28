const PERCENT = 100;
const ONE_DECIMAL = 10;

/**
 * The change from the comparison period, rounded to one decimal: 120 visits
 * in August and 150 in September is +25. `null` when the comparison period
 * had none, because growth from nothing has no percentage.
 */
export function computeChangePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * PERCENT * ONE_DECIMAL) / ONE_DECIMAL;
}
