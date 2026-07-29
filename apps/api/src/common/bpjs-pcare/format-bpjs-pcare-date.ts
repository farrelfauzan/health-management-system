/**
 * Formats a date as PCare's dd-MM-yyyy convention (ADR D-022). Uses the UTC
 * calendar parts: clinic-local calendar days are stored as UTC-midnight
 * dates (the queueDate convention), so UTC parts are the clinic-local day.
 */
export function formatBpjsPcareDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const year = String(value.getUTCFullYear());
  return `${day}-${month}-${year}`;
}
