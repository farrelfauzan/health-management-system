import type { PostnatalSubjectValue, PostnatalVisitCodeValue } from '#maternal-care/schemas';
import type { PostnatalVisitWindow } from '#maternal-care/types';
import {
  getCalendarDateInTimeZone,
  getStartOfCalendarDateInTimeZone,
} from '#registration-flow/schemas';

const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * A bound is either an absolute offset from the birth in hours, or a
 * clinic-local calendar day counted with the birth date as day 0.
 */
type PostnatalWindowBound = { readonly hours: number } | { readonly day: number };

type PostnatalWindowDefinition = {
  readonly code: PostnatalVisitCodeValue;
  readonly subject: PostnatalSubjectValue;
  readonly start: PostnatalWindowBound;
  readonly end: PostnatalWindowBound;
};

/**
 * The seven windows, as SATUSEHAT's PNC playbook and the Buku KIA state them
 * (P25-T12): KF1 6 hours – 2 days, KF2 3–7 days, KF3 8–28 days, KF4 29–42
 * days; KN1 6–48 hours, KN2 3–7 days, KN3 8–28 days.
 *
 * Hour bounds are absolute; a day bound means the whole calendar day — "3–7
 * days" opens at 00:00 of day 3 and closes at 23:59:59.999 of day 7. So KF1's
 * "2 days" ends with day 2, while KN1's "48 hours" ends at the birth time two
 * days on: the gap between KN1 and KN2 is real, and a baby seen there is
 * outside every window. These boundaries are an open question for product.
 */
const POSTNATAL_WINDOW_DEFINITIONS: readonly PostnatalWindowDefinition[] = [
  { code: 'KF1', subject: 'MOTHER', start: { hours: 6 }, end: { day: 2 } },
  { code: 'KF2', subject: 'MOTHER', start: { day: 3 }, end: { day: 7 } },
  { code: 'KF3', subject: 'MOTHER', start: { day: 8 }, end: { day: 28 } },
  { code: 'KF4', subject: 'MOTHER', start: { day: 29 }, end: { day: 42 } },
  { code: 'KN1', subject: 'NEWBORN', start: { hours: 6 }, end: { hours: 48 } },
  { code: 'KN2', subject: 'NEWBORN', start: { day: 3 }, end: { day: 7 } },
  { code: 'KN3', subject: 'NEWBORN', start: { day: 8 }, end: { day: 28 } },
];

function addCalendarDays(dateValue: string, days: number): string {
  const shifted = new Date(
    new Date(`${dateValue}T00:00:00Z`).getTime() + days * MILLISECONDS_PER_DAY,
  );
  return shifted.toISOString().slice(0, 10);
}

function resolveStartInstant(
  bound: PostnatalWindowBound,
  birthAt: Date,
  birthDate: string,
  timeZone: string,
): Date {
  if ('hours' in bound) {
    return new Date(birthAt.getTime() + bound.hours * MILLISECONDS_PER_HOUR);
  }
  return getStartOfCalendarDateInTimeZone(addCalendarDays(birthDate, bound.day), timeZone);
}

function resolveEndInstant(
  bound: PostnatalWindowBound,
  birthAt: Date,
  birthDate: string,
  timeZone: string,
): Date {
  if ('hours' in bound) {
    return new Date(birthAt.getTime() + bound.hours * MILLISECONDS_PER_HOUR);
  }
  const nextDayStart = getStartOfCalendarDateInTimeZone(
    addCalendarDays(birthDate, bound.day + 1),
    timeZone,
  );
  return new Date(nextDayStart.getTime() - 1);
}

/**
 * The KF1–KF4 and KN1–KN3 windows of one birth, in that order (P25-T12).
 * `timeZone` is the clinic's (`CLINIC_TIMEZONE`): day 0 is the birth's
 * calendar date on the clinic's clock, not in UTC.
 */
export function buildPostnatalVisitWindows(params: {
  birthAt: Date;
  timeZone: string;
}): PostnatalVisitWindow[] {
  const birthDate = getCalendarDateInTimeZone(params.birthAt, params.timeZone);
  return POSTNATAL_WINDOW_DEFINITIONS.map((definition) => ({
    code: definition.code,
    subject: definition.subject,
    startsAt: resolveStartInstant(definition.start, params.birthAt, birthDate, params.timeZone),
    endsAt: resolveEndInstant(definition.end, params.birthAt, birthDate, params.timeZone),
  }));
}
