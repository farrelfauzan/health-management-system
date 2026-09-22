import { resolvePregnancyStartDate } from '#maternal-care/compute-gestational-age';
import {
  FIRST_TRIMESTER_LAST_WEEK,
  SECOND_TRIMESTER_LAST_WEEK,
} from '#maternal-care/resolve-trimester';
import type { TrimesterWindow } from '#maternal-care/types';

const ONE_DAY_IN_MILLISECONDS = 86_400_000;
const DAYS_IN_WEEK = 7;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * ONE_DAY_IN_MILLISECONDS);
}

/**
 * The three trimesters of one pregnancy as dates (P25-T17), on the same
 * boundaries `resolveTrimester` uses: trimester 1 runs through the last day
 * of week 12, trimester 2 through the last day of week 24, and trimester 3
 * until the HPL. Both input dates are `@db.Date` values (midnight UTC).
 */
export function resolveTrimesterWindows(params: {
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
}): TrimesterWindow[] {
  const startDate = resolvePregnancyStartDate(params);
  const secondStart = addDays(startDate, (FIRST_TRIMESTER_LAST_WEEK + 1) * DAYS_IN_WEEK);
  const thirdStart = addDays(startDate, (SECOND_TRIMESTER_LAST_WEEK + 1) * DAYS_IN_WEEK);
  return [
    { trimester: 1, startsOn: toDateOnly(startDate), endsOn: toDateOnly(addDays(secondStart, -1)) },
    {
      trimester: 2,
      startsOn: toDateOnly(secondStart),
      endsOn: toDateOnly(addDays(thirdStart, -1)),
    },
    {
      trimester: 3,
      startsOn: toDateOnly(thirdStart),
      endsOn: toDateOnly(params.estimatedDeliveryDate),
    },
  ];
}
