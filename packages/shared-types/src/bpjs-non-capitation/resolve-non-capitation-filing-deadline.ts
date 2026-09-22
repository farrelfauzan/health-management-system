import { addMonthsToCalendarDate } from '#bpjs-non-capitation/add-months-to-calendar-date';

/**
 * The induk's filing date for the services of `month`: day `filingDayOfMonth`
 * of the following month (Permenkes 28/2014 lampiran p. 31 point 8 sets the
 * 10th; the induk's PKS may set another, which is why the day is a setting).
 */
export function resolveNonCapitationFilingDeadline(
  month: string,
  filingDayOfMonth: number,
): string {
  const nextMonth = addMonthsToCalendarDate(`${month}-01`, 1).slice(0, 7);
  return `${nextMonth}-${String(filingDayOfMonth).padStart(2, '0')}`;
}
