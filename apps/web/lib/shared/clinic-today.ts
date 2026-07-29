const CLINIC_TIMEZONE = process.env.NEXT_PUBLIC_CLINIC_TIMEZONE ?? 'Asia/Jakarta';

/**
 * The clinic's current calendar day as YYYY-MM-DD. Server-side only: the
 * clinic day is a property of the facility, not of whoever is looking at the
 * screen, and the API bounds its date filters the same way.
 */
export function resolveClinicToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
