const MILLISECONDS_PER_DAY = 86_400_000;

/** Whole days from one `YYYY-MM-DD` to another; negative when `to` is earlier. */
export function countDaysBetweenCalendarDates(from: string, to: string): number {
  const fromInstant = Date.parse(`${from}T00:00:00Z`);
  const toInstant = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toInstant - fromInstant) / MILLISECONDS_PER_DAY);
}
