import type { AnalyticsPracticeControllerGetMyPracticeV1Params } from '#lib/api/generated/model/analyticsPracticeControllerGetMyPracticeV1Params';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

/**
 * The practice endpoint's query: the period only. The API reads the
 * clinician from the session and ignores any narrowing, so none is sent.
 */
export function toAnalyticsPracticeParams(
  state: AnalyticsFilterState,
): AnalyticsPracticeControllerGetMyPracticeV1Params {
  return { from: state.from, to: state.to, compare: state.compare ? 'true' : 'false' };
}
