import type { AnalyticsPharmacyControllerGetPharmacyV1Params } from '#lib/api/generated/model/analyticsPharmacyControllerGetPharmacyV1Params';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

/** The pharmacy endpoint's query for a filter. */
export function toAnalyticsPharmacyParams(
  state: AnalyticsFilterState,
): AnalyticsPharmacyControllerGetPharmacyV1Params {
  return {
    from: state.from,
    to: state.to,
    compare: state.compare ? 'true' : 'false',
    specialtyId: state.specialtyId,
    doctorId: state.doctorId,
    payerType: state.payerType,
  };
}
