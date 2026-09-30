import type { AnalyticsCaseMixControllerGetCaseMixV1Params } from '#lib/api/generated/model/analyticsCaseMixControllerGetCaseMixV1Params';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

/** The case-mix endpoint's query for a filter. */
export function toAnalyticsCaseMixParams(
  state: AnalyticsFilterState,
): AnalyticsCaseMixControllerGetCaseMixV1Params {
  return {
    from: state.from,
    to: state.to,
    compare: state.compare ? 'true' : 'false',
    specialtyId: state.specialtyId,
    doctorId: state.doctorId,
    payerType: state.payerType,
  };
}
