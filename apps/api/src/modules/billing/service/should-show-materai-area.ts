/**
 * FR-E1-13: the materai area appears only when the total *exceeds* the
 * threshold — a bill exactly at the threshold carries no stamp.
 */
export function shouldShowMateraiArea(totalAmount: number, thresholdIdr: number): boolean {
  return totalAmount > thresholdIdr;
}
