import type { AnalyticsFinanceControllerGetFinanceV1Params } from '#lib/api/generated/model/analyticsFinanceControllerGetFinanceV1Params';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

/** The finance endpoint's query for a filter. */
export function toAnalyticsFinanceParams(
  state: AnalyticsFilterState,
): AnalyticsFinanceControllerGetFinanceV1Params {
  return {
    from: state.from,
    to: state.to,
    compare: state.compare ? 'true' : 'false',
    specialtyId: state.specialtyId,
    doctorId: state.doctorId,
    payerType: state.payerType,
  };
}
