const MINUTE_MS = 60_000;

const HOUR_MS = 3_600_000;

const DAY_MS = 86_400_000;

export type WaitingTime = {
  unit: 'minutes' | 'hours' | 'days';
  count: number;
};

/**
 * How long an order has been waiting, in the coarsest unit that still says
 * something (P18-T08). Minutes under an hour, hours under a day, then days:
 * a bench does not need to know a cito has waited 187 minutes, it needs to
 * know it has waited three hours.
 */
export function formatWaitingTime(since: string, now: Date = new Date()): WaitingTime {
  const elapsed = Math.max(0, now.getTime() - new Date(since).getTime());
  if (elapsed < HOUR_MS) {
    return { unit: 'minutes', count: Math.floor(elapsed / MINUTE_MS) };
  }
  if (elapsed < DAY_MS) {
    return { unit: 'hours', count: Math.floor(elapsed / HOUR_MS) };
  }
  return { unit: 'days', count: Math.floor(elapsed / DAY_MS) };
}
