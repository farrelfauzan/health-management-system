import type { AnalyticsLaboratoryControllerGetLaboratoryV1Params } from '#lib/api/generated/model/analyticsLaboratoryControllerGetLaboratoryV1Params';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

/** The laboratory endpoint's query for a filter. */
export function toAnalyticsLaboratoryParams(
  state: AnalyticsFilterState,
): AnalyticsLaboratoryControllerGetLaboratoryV1Params {
  return {
    from: state.from,
    to: state.to,
    compare: state.compare ? 'true' : 'false',
    specialtyId: state.specialtyId,
    doctorId: state.doctorId,
    payerType: state.payerType,
  };
}
