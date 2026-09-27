/**
 * The clinic's time zone when `CLINIC_TIMEZONE` is unset. Every analytics
 * range is cut in this zone, so a payment at 23:30 WIB on the last day of the
 * month belongs to that month and not the next.
 */
export const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
