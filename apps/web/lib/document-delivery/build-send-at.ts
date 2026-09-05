/**
 * Turns the dialog's date and time fields into the ISO instant the API
 * expects (P16-T38), in the browser's own zone — the cashier and the clinic
 * are in the same room. Returns null when either half is missing.
 */
export function buildSendAt(date: string, time: string): string | null {
  if (date.trim() === '' || time.trim() === '') {
    return null;
  }
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
