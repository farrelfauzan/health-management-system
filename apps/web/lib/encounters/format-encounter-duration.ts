const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/**
 * How long the visit has been open, or how long it ran once closed. Reads as
 * clinic floor language ("42m", "1h 08m") rather than a timestamp difference.
 */
type DurationMessages = {
  minutes?: (minutes: number) => string;
  hoursMinutes?: (hours: number, minutes: number) => string;
};

export function formatEncounterDuration(
  startedAt: string,
  endedAt?: string,
  messages: DurationMessages = {},
): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '-';
  }

  const totalMinutes = Math.floor((end - start) / MILLISECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  if (hours === 0) {
    return messages.minutes?.(minutes) ?? `${minutes}m`;
  }

  return (
    messages.hoursMinutes?.(hours, minutes) ?? `${hours}h ${String(minutes).padStart(2, '0')}m`
  );
}
