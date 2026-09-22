/**
 * A stored instant as the `DD/MM/YYYY` the register prints, on the clinic's
 * calendar. Pass a `@db.Date` value with `timeZone: 'UTC'`: it is already a
 * calendar day and must not be shifted.
 */
export function formatMaternalReportDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(instant);
}
