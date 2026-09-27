const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` calendar date as a UTC-midnight `Date`, or `null` when the
 * text is not a real date. Round-trips the value, because `new Date` quietly
 * rolls 30 February over into March instead of refusing it.
 */
export function parseCalendarDate(value: string): Date | null {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return parsed;
}
