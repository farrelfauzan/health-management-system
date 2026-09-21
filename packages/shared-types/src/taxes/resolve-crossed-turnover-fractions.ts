/** The PKP registration threshold: Rp 4.8 bn of turnover in a calendar year. */
export const PKP_TURNOVER_THRESHOLD_RUPIAH = 4_800_000_000;

/**
 * The fractions of the threshold a warning is raised at, lowest first
 * (P27-T10). 80% is a heads-up while there is still time to prepare; 100% is
 * the obligation itself.
 */
export const PKP_TURNOVER_WARNING_FRACTIONS: readonly number[] = [0.8, 1];

/**
 * The turnover warnings a calendar year's takings have crossed (P27-T10).
 *
 * Returns every fraction the figure is at or past, so a clinic whose turnover
 * jumped both marks between two sweeps is told about both rather than only the
 * higher one — the 80% notice is the one that says "prepare", and skipping it
 * because the number moved fast would be exactly backwards.
 *
 * Turnover is the same cash-basis figure the PP 55 report is built from —
 * payments received — so the monitor and the report can never disagree about
 * what the clinic has taken.
 */
export function resolveCrossedTurnoverFractions(turnoverRupiah: number): number[] {
  return PKP_TURNOVER_WARNING_FRACTIONS.filter(
    (fraction) => turnoverRupiah >= PKP_TURNOVER_THRESHOLD_RUPIAH * fraction,
  );
}
