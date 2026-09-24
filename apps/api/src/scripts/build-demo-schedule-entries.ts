import { DemoScheduleEntry } from './seed-demo.types';

const DAYS_PER_WEEK = 7;

/** Wide enough that a demo at any reasonable hour falls inside a session. */
const DEMO_SESSION_START = '07:00';
const DEMO_SESSION_END = '22:00';

/**
 * One 07:00–22:00 window on every day of the week, clinic time, unlimited
 * capacity. A check-in against a booking is refused outside the doctor's
 * session (`REGISTRATION_OUTSIDE_SESSION`), so the demo clinicians practise
 * all day, every day. Sessions themselves are materialised lazily on the
 * first booking, so no session rows are written here.
 */
export function buildDemoScheduleEntries(): DemoScheduleEntry[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime: DEMO_SESSION_START,
    endTime: DEMO_SESSION_END,
    isAvailable: true,
    maxPatients: null,
  }));
}
