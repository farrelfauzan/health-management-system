import { computeChangePercent } from '@hms/shared-types';

import type {
  AnalyticsDelta,
  AnalyticsDeltaDirection,
  AnalyticsDeltaInput,
  AnalyticsDeltaTone,
} from '#lib/analytics/analytics-filter-state';

const ONE_DECIMAL = 10;

function resolveDirection(value: number): AnalyticsDeltaDirection {
  if (value > 0) {
    return 'up';
  }
  return value < 0 ? 'down' : 'flat';
}

function resolveTone(
  direction: AnalyticsDeltaDirection,
  higherIsBetter: boolean,
): AnalyticsDeltaTone {
  if (direction === 'flat') {
    return 'neutral';
  }
  return (direction === 'up') === higherIsBetter ? 'good' : 'bad';
}

function resolveDeltaValue({
  current,
  previous,
  kind,
}: Pick<AnalyticsDeltaInput, 'kind'> & { current: number; previous: number }): number | null {
  if (kind === 'percent') {
    return computeChangePercent(current, previous);
  }
  if (kind === 'minutes' || kind === 'rupiah' || kind === 'invoices' || kind === 'count') {
    return Math.round(current - previous);
  }
  return Math.round((current - previous) * ONE_DECIMAL) / ONE_DECIMAL;
}

/**
 * The change a KPI tile shows under its value, or `null` when there is
 * nothing honest to show: no comparison figure, or growth from zero. The
 * tile writes the arrow and the signed number as well as the colour, so the
 * colour is never the only signal.
 */
export function resolveAnalyticsDelta({
  current,
  previous,
  kind,
  higherIsBetter,
}: AnalyticsDeltaInput): AnalyticsDelta | null {
  if (current === null || previous === null) {
    return null;
  }
  const value = resolveDeltaValue({ current, previous, kind });
  if (value === null) {
    return null;
  }
  const direction = resolveDirection(value);
  return { kind, direction, tone: resolveTone(direction, higherIsBetter), value };
}
