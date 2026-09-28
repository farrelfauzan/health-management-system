import type { AnalyticsOperationsControllerGetOperationsV1Params } from '#lib/api/generated/model/analyticsOperationsControllerGetOperationsV1Params';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

/** The operations endpoint's query for a filter. The payer filter waits for P29-T07. */
export function toAnalyticsOperationsParams(
  state: AnalyticsFilterState,
): AnalyticsOperationsControllerGetOperationsV1Params {
  return {
    from: state.from,
    to: state.to,
    compare: state.compare ? 'true' : 'false',
    specialtyId: state.specialtyId,
    doctorId: state.doctorId,
  };
}
