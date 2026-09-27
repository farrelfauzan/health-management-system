import type { AnalyticsCount } from '#analytics/contracts';
import { ANALYTICS_SUPPRESSION_THRESHOLD } from '#analytics/suppress-small-cells';

/**
 * One clinical or demographic figure on its own, such as a headline total
 * that is itself small: 1–4 are withheld, zero is shown.
 */
export function suppressSmallCount(
  count: number,
  threshold: number = ANALYTICS_SUPPRESSION_THRESHOLD,
): AnalyticsCount {
  return count > 0 && count < threshold ? { suppressed: true } : count;
}
