const MONTHS_PER_YEAR = 12;

/**
 * Whole years lived, which is what a reference range is banded on (P18-T01) and
 * what an analis compares a result against.
 *
 * Calendar arithmetic rather than a division by 365.25: a range that changes at
 * 18 has to change on the birthday, not two days either side of it.
 */
export function toPatientAgeYears(dateOfBirth: Date, asOf: Date): number {
  const months =
    (asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear()) * MONTHS_PER_YEAR +
    (asOf.getUTCMonth() - dateOfBirth.getUTCMonth());
  const hasHadBirthdayThisMonth = asOf.getUTCDate() >= dateOfBirth.getUTCDate();

  return Math.max(0, Math.floor((months - (hasHadBirthdayThisMonth ? 0 : 1)) / MONTHS_PER_YEAR));
}
