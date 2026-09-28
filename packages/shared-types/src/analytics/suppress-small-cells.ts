import type { AnalyticsCount } from '#analytics/contracts';
import type { AnalyticsCountCell, SuppressSmallCellsParams } from '#analytics/types';

/** Counts below this, and above zero, are withheld (PRD FR-FDN-05, Q-6). */
export const ANALYTICS_SUPPRESSION_THRESHOLD = 5;

type SuppressedCell<TCell extends AnalyticsCountCell> = Omit<TCell, 'count'> & {
  count: AnalyticsCount;
};

function isSmallCount(count: number, threshold: number): boolean {
  return count > 0 && count < threshold;
}

function findComplementaryIndex(counts: readonly number[], hidden: ReadonlySet<number>): number {
  return counts.reduce<number>((smallest, count, index) => {
    if (hidden.has(index) || count === 0) {
      return smallest;
    }
    return smallest === -1 || count < (counts[smallest] ?? Number.POSITIVE_INFINITY)
      ? index
      : smallest;
  }, -1);
}

/**
 * Withholds small clinical and demographic counts in a breakdown. Totals are
 * computed by the caller *before* this runs, so they stay exact. When exactly
 * one cell is withheld, the next smallest is withheld too: otherwise the
 * total minus the visible cells gives the hidden one back. `[40, 12, 3, 9]`
 * shows 40 and 12 and hides the 3 and the 9.
 */
export function suppressSmallCells<TCell extends AnalyticsCountCell>({
  cells,
  threshold = ANALYTICS_SUPPRESSION_THRESHOLD,
}: SuppressSmallCellsParams<TCell>): SuppressedCell<TCell>[] {
  const counts = cells.map((cell) => cell.count);
  const hidden = new Set(
    counts.flatMap((count, index) => (isSmallCount(count, threshold) ? [index] : [])),
  );
  if (hidden.size === 1) {
    const complementaryIndex = findComplementaryIndex(counts, hidden);
    if (complementaryIndex !== -1) {
      hidden.add(complementaryIndex);
    }
  }
  return cells.map((cell, index) => ({
    ...cell,
    count: hidden.has(index) ? { suppressed: true } : cell.count,
  }));
}
