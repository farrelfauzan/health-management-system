const MILLISECONDS_PER_MINUTE = 60_000;

/** `now` as a `datetime-local` value in the browser's zone, to prefill a form. */
export function toDatetimeLocalValue(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * MILLISECONDS_PER_MINUTE);
  return local.toISOString().slice(0, 16);
}
