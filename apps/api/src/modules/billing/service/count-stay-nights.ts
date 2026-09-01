import { getCalendarDateInTimeZone } from '@hms/shared-types';

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * How many billable nights one stay covers, for the `admission.nights`
 * template token (`P16-T06`).
 *
 * Same definition IMP-15 prices by: a night is a clinic-local midnight the
 * patient was admitted across — `admittedAt < midnight <= endedAt` — which is
 * exactly the number of calendar-date boundaries between the two instants in
 * the clinic's zone. A 23:00-to-01:00 stay is one night; a same-day admit and
 * discharge is zero.
 */
export function countStayNights(params: {
  readonly admittedAt: Date;
  readonly endedAt: Date;
  readonly timeZone: string;
}): number {
  const { admittedAt, endedAt, timeZone } = params;
  if (endedAt.getTime() <= admittedAt.getTime()) {
    return 0;
  }
  const startDate = getCalendarDateInTimeZone(admittedAt, timeZone);
  const endDate = getCalendarDateInTimeZone(endedAt, timeZone);
  const elapsedDays = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      MILLISECONDS_PER_DAY,
  );
  return Math.max(0, elapsedDays);
}
