const MONTHS_PER_YEAR = 12;

/**
 * Whole calendar months lived on `asOf` (P25-T03). Both dates are calendar
 * dates carried as midnight UTC, the way `@db.Date` columns and clinic-local
 * days are read, so only their UTC year, month and day are compared.
 *
 * Calendar arithmetic rather than a division by 30.44: MTBS covers 0–59
 * months (Permenkes 25/2014 Pasal 1 angka 10), and the child turns 60 months
 * on the day of the month she was born, not two days either side of it. A
 * child born on the 31st completes a month on the last day of a shorter month
 * (born 31 Jan → one month old on 28/29 Feb), and a leap-day birth completes
 * its year on 28 February.
 */
export function toPatientAgeInMonths(params: { dateOfBirth: Date; asOf: Date }): number {
  const { dateOfBirth, asOf } = params;
  const elapsedMonths =
    (asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear()) * MONTHS_PER_YEAR +
    (asOf.getUTCMonth() - dateOfBirth.getUTCMonth());
  const lastDayOfAsOfMonth = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const monthAnniversaryDay = Math.min(dateOfBirth.getUTCDate(), lastDayOfAsOfMonth);
  const hasReachedAnniversary = asOf.getUTCDate() >= monthAnniversaryDay;
  return Math.max(0, elapsedMonths - (hasReachedAnniversary ? 0 : 1));
}
