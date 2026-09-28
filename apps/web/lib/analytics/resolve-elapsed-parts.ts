import type { ElapsedParts } from '#lib/analytics/analytics-filter-state';

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * The age of the oldest pending submission, measured to when the figures
 * were read (`generatedAt`), not to the viewer's clock, so a cached answer
 * does not age on screen. Minutes under an hour, hours and minutes under a
 * day, whole days beyond.
 */
export function resolveElapsedParts(sinceIso: string, untilIso: string): ElapsedParts {
  const totalMinutes = Math.max(
    0,
    Math.floor((Date.parse(untilIso) - Date.parse(sinceIso)) / MILLISECONDS_PER_MINUTE),
  );
  if (totalMinutes < MINUTES_PER_HOUR) {
    return { unit: 'minutes', minutes: totalMinutes };
  }
  if (totalMinutes < MINUTES_PER_DAY) {
    return {
      unit: 'hoursMinutes',
      hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
      minutes: totalMinutes % MINUTES_PER_HOUR,
    };
  }
  return { unit: 'days', days: Math.floor(totalMinutes / MINUTES_PER_DAY) };
}
