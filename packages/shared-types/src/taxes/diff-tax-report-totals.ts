import type { TaxReportDifference, TaxReportSummary } from '#taxes/types';

/**
 * Which totals of a stored report no longer match the books (P27-T05). A
 * finalized draft is never rewritten; the page shows these differences so the
 * clinic knows to amend what it filed — an invoice voided after the report,
 * a late payment recorded for the month.
 */
export function diffTaxReportTotals(
  stored: TaxReportSummary,
  live: TaxReportSummary,
): TaxReportDifference[] {
  const storedTotals: Record<string, number> = stored.totals;
  const liveTotals: Record<string, number> = live.totals;
  return Object.keys(storedTotals)
    .filter((field) => storedTotals[field] !== liveTotals[field])
    .map((field) => ({ field, stored: storedTotals[field] ?? 0, live: liveTotals[field] ?? 0 }));
}
