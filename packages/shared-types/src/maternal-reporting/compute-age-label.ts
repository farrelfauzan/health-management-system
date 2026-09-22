const DAYS_PER_MONTH_APPROXIMATION = 30.4375;
const DAYS_PER_YEAR_APPROXIMATION = 365.25;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * An age the register prints: whole years past the first birthday, months
 * before it, days inside the neonatal month (P25-T15). Counted from the date
 * of birth to `asOf`, both taken as calendar days.
 */
export function computeAgeLabel(dateOfBirth: Date, asOf: Date): string {
  const days = Math.floor((asOf.getTime() - dateOfBirth.getTime()) / MILLISECONDS_PER_DAY);
  if (days < 0) {
    return '';
  }
  if (days < DAYS_PER_MONTH_APPROXIMATION) {
    return `${days} hari`;
  }
  if (days < DAYS_PER_YEAR_APPROXIMATION) {
    return `${Math.floor(days / DAYS_PER_MONTH_APPROXIMATION)} bulan`;
  }
  return `${Math.floor(days / DAYS_PER_YEAR_APPROXIMATION)} tahun`;
}
