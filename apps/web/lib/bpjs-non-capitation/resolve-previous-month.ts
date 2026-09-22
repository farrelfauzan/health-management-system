import { addMonthsToCalendarDate } from '@hms/shared-types';

const MONTH_LENGTH = 7;

/**
 * `YYYY-MM` of the month before `today` (`YYYY-MM-DD`): the month the induk
 * files next, which is what the recap opens on (P25-T16).
 */
export function resolvePreviousMonth(today: string): string {
  return addMonthsToCalendarDate(`${today.slice(0, MONTH_LENGTH)}-01`, -1).slice(0, MONTH_LENGTH);
}
