/**
 * The clinic's time zone when `CLINIC_TIMEZONE` is unset. Clinic calendar days
 * (today's queue, a month's report, an offboarding deadline) are cut in this
 * zone, so a payment at 23:30 WIB on the last day of the month belongs to that
 * month and not the next.
 */
export const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
