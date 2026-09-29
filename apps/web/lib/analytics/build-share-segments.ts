import type {
  AnalyticsSeriesColor,
  AnalyticsShareSegment,
} from '#lib/analytics/analytics-filter-state';

type ShareSegmentInput = {
  key: string;
  label: string;
  value: number;
  color: AnalyticsSeriesColor;
};

const PERCENT = 100;

/**
 * Whole-number shares that add up to exactly 100: each is rounded down and
 * the points left over go to the largest remainders, so a legend never reads
 * 99% or 101%. Nothing to share gives every segment 0%.
 */
export function buildShareSegments(inputs: readonly ShareSegmentInput[]): AnalyticsShareSegment[] {
  const total = inputs.reduce((sum, input) => sum + input.value, 0);
  if (total <= 0) {
    return inputs.map((input) => ({ ...input, percent: 0 }));
  }
  const exact = inputs.map((input) => (input.value / total) * PERCENT);
  const floors = exact.map(Math.floor);
  const leftover = PERCENT - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, leftover)
    .map((entry) => entry.index);
  return inputs.map((input, index) => ({
    ...input,
    percent: (floors[index] ?? 0) + (byRemainder.includes(index) ? 1 : 0),
  }));
}
