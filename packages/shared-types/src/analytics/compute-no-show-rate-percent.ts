import type { AnalyticsNoShowCounts } from '#analytics/types';

const PERCENT = 100;
const ONE_DECIMAL = 10;

/**
 * NO_SHOW / (COMPLETED + NO_SHOW), in percent with one decimal (PRD
 * FR-OPS-04): 30 completed and 10 no-shows is 25. Cancelled, rejected and
 * still-scheduled appointments are left out, since none of them was a chance
 * to turn up. `null` when there is nothing to divide by.
 */
export function computeNoShowRatePercent({
  completed,
  noShows,
}: AnalyticsNoShowCounts): number | null {
  const attended = completed + noShows;
  if (attended === 0) {
    return null;
  }
  return Math.round((noShows / attended) * PERCENT * ONE_DECIMAL) / ONE_DECIMAL;
}
