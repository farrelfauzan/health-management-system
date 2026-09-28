/**
 * The nearest-rank percentile of a list of timings: p95 of twenty runs is the
 * nineteenth fastest. Nearest rank rather than interpolation, so the answer
 * is always a run that actually happened.
 */
export function computePercentile(samples: readonly number[], percentile: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? 0;
}
