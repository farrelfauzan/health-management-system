const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days lived on `asOf` (P25-T03): the day of birth is day 0. Both dates
 * are calendar dates carried as midnight UTC, so the difference is an exact
 * multiple of a day and no clock or daylight-saving shift can move it.
 *
 * Asked for the neonatal period — 0–28 days (Permenkes 25/2014 Pasal 1
 * angka 2) — where one day decides whether a midwife may give first aid.
 */
export function toPatientAgeInDays(params: { dateOfBirth: Date; asOf: Date }): number {
  const startOfBirthDay = Date.UTC(
    params.dateOfBirth.getUTCFullYear(),
    params.dateOfBirth.getUTCMonth(),
    params.dateOfBirth.getUTCDate(),
  );
  const startOfAsOfDay = Date.UTC(
    params.asOf.getUTCFullYear(),
    params.asOf.getUTCMonth(),
    params.asOf.getUTCDate(),
  );
  return Math.max(0, Math.round((startOfAsOfDay - startOfBirthDay) / MILLISECONDS_PER_DAY));
}
