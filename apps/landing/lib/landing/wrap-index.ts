/** Wraps `index` into `[0, count)`, so stepping past either end of a list loops around. */
export function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}
