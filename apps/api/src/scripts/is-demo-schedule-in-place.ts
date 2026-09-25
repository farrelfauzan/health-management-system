import { DemoScheduleEntry } from './seed-demo.types';

/**
 * True when the stored weekly schedule is exactly the demo one, so a re-run
 * leaves it untouched. Anything else — a missing day, an edited window, a
 * capacity somebody set — is replaced, because the demo depends on every day
 * being open.
 */
export function isDemoScheduleInPlace(input: {
  stored: readonly DemoScheduleEntry[];
  expected: readonly DemoScheduleEntry[];
}): boolean {
  if (input.stored.length !== input.expected.length) {
    return false;
  }
  return input.expected.every((expectedEntry) =>
    input.stored.some(
      (storedEntry) =>
        storedEntry.dayOfWeek === expectedEntry.dayOfWeek &&
        storedEntry.startTime === expectedEntry.startTime &&
        storedEntry.endTime === expectedEntry.endTime &&
        storedEntry.isAvailable === expectedEntry.isAvailable &&
        storedEntry.maxPatients === expectedEntry.maxPatients,
    ),
  );
}
