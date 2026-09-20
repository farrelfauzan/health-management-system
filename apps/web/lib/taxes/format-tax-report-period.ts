/** A `YYYY-MM` period as a month name, e.g. "September 2026" (P27-T05). */
export function formatTaxReportPeriod(period: string, locale: string): string {
  const [year = '1970', month = '1'] = period.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
