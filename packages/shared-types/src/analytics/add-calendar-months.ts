const CALENDAR_DATE_LENGTH = 10;

/**
 * Moves a `YYYY-MM-DD` calendar date by whole months, clamping to the last
 * day of the target month: 31 January plus one month is 28 (or 29) February,
 * not 3 March.
 */
export function addCalendarMonths(value: string, months: number): string {
  const base = new Date(`${value}T00:00:00.000Z`);
  const year = base.getUTCFullYear();
  const day = base.getUTCDate();
  const targetMonthIndex = base.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonthIndex, Math.min(day, lastDayOfTarget)))
    .toISOString()
    .slice(0, CALENDAR_DATE_LENGTH);
}
