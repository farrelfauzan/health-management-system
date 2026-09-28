import { analyticsFilterSchema } from '@hms/shared-types';

import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';

export type AnalyticsRangeProblem = 'range-too-long' | 'end-before-start';

/**
 * Checks a custom range with the API's own schema, so the filter bar refuses
 * exactly what the API would and never sends a request it knows will fail.
 */
export function validateAnalyticsFilterRange({
  from,
  to,
}: AnalyticsPeriodRange): AnalyticsRangeProblem | null {
  const result = analyticsFilterSchema.safeParse({ from, to });
  if (result.success) {
    return null;
  }
  return from > to ? 'end-before-start' : 'range-too-long';
}
