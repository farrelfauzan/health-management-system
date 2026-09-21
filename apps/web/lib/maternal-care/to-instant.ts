/**
 * A `datetime-local` value is wall-clock time with no zone. The API takes UTC
 * instants, so the browser's own zone — which is the clinic's, on a clinic
 * machine — is what resolves it.
 */
export function toInstant(localValue: string): string {
  return new Date(localValue).toISOString();
}
