/** Naegele's rule: the HPL is 280 days — forty weeks — after the HPHT. */
const GESTATION_DAYS = 280;
const ONE_DAY_IN_MILLISECONDS = 86_400_000;

/**
 * The estimated delivery date (HPL) from the last menstrual period (HPHT),
 * by Naegele's rule (P25-T06).
 *
 * Arithmetic on the UTC instant rather than on calendar fields: HPHT is stored
 * as a `@db.Date`, so it is already midnight UTC, and adding days this way
 * cannot be moved by a daylight-saving boundary the way `setMonth(+3)` can.
 * The answer a clinician overrides — from an ultrasound, say — is recorded
 * with its source instead of computed here.
 */
export function computeEstimatedDeliveryDate(lastMenstrualPeriodDate: Date): Date {
  return new Date(lastMenstrualPeriodDate.getTime() + GESTATION_DAYS * ONE_DAY_IN_MILLISECONDS);
}
