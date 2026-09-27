const MILLISECONDS_PER_DAY = 86_400_000;

/** Calendar days from `from` to `to`, both included: 1–30 September is 30. */
export function countCalendarDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / MILLISECONDS_PER_DAY) + 1;
}
