/** The twelve `YYYY-MM` periods of a year, in order (P27-T05). */
export function buildTaxReportPeriods(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
}
