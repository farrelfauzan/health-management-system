const MONTHS_PER_YEAR = 12;

/**
 * `YYYY-MM-DD` plus whole months, clamped to the last day of the target
 * month: 31 August plus six months is 28 (or 29) February, not 3 March.
 */
export function addMonthsToCalendarDate(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const monthIndex = Number(date.slice(5, 7)) - 1 + months;
  const day = Number(date.slice(8, 10));
  const targetYear = year + Math.floor(monthIndex / MONTHS_PER_YEAR);
  const targetMonthIndex = ((monthIndex % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const month = String(targetMonthIndex + 1).padStart(2, '0');
  return `${String(targetYear)}-${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
