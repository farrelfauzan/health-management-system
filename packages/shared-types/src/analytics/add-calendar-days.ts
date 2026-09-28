const MILLISECONDS_PER_DAY = 86_400_000;
const CALENDAR_DATE_LENGTH = 10;

/**
 * Moves a `YYYY-MM-DD` calendar date by whole days. Pure calendar arithmetic
 * in UTC, so no time zone and no daylight saving can shift the answer.
 */
export function addCalendarDays(value: string, days: number): string {
  const base = new Date(`${value}T00:00:00.000Z`).getTime();
  return new Date(base + days * MILLISECONDS_PER_DAY).toISOString().slice(0, CALENDAR_DATE_LENGTH);
}
