import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { DEFAULT_ANALYTICS_PRESET } from '#lib/analytics/parse-analytics-filter-params';

/**
 * The URL query for a filter, the inverse of `parseAnalyticsFilterParams`.
 * Defaults are left out so the plain dashboard link stays plain; custom
 * dates are written only for a custom period, because a preset is
 * recomputed from today on every visit.
 */
export function toAnalyticsFilterSearchParams(state: AnalyticsFilterState): string {
  const params = new URLSearchParams();
  if (state.preset !== DEFAULT_ANALYTICS_PRESET) {
    params.set('period', state.preset);
  }
  if (state.preset === 'custom') {
    params.set('from', state.from);
    params.set('to', state.to);
  }
  if (!state.compare) {
    params.set('compare', 'false');
  }
  if (state.specialtyId) {
    params.set('poli', state.specialtyId);
  }
  if (state.doctorId) {
    params.set('doctor', state.doctorId);
  }
  return params.toString();
}
