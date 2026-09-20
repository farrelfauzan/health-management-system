import type { GestationalAge } from '#maternal-care/types';

const ONE_DAY_IN_MILLISECONDS = 86_400_000;
const DAYS_IN_WEEK = 7;
/** Naegele again, read backwards: an HPL implies an HPHT 280 days earlier. */
const GESTATION_DAYS = 280;

/**
 * How far along the pregnancy is at `asOf`, counted from the HPHT (P25-T06).
 *
 * When no HPHT was recorded — a woman who books late often cannot say — the
 * HPL stands in for it, 280 days earlier. That is not a second method, it is
 * the same one inverted, which is why an ultrasound-derived HPL still gives a
 * usable gestational age.
 *
 * Both dates are stored as `@db.Date` (midnight UTC), and `asOf` is expected
 * to be the clinic-local calendar date of the encounter already reduced the
 * same way, so this is whole-day arithmetic with nothing to round. A date
 * before conception returns zero rather than a negative age: a
 * mistyped HPHT should read as implausible, not as minus three weeks.
 */
export function computeGestationalAge(params: {
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
  asOf: Date;
}): GestationalAge {
  const startDate =
    params.lastMenstrualPeriodDate ??
    new Date(params.estimatedDeliveryDate.getTime() - GESTATION_DAYS * ONE_DAY_IN_MILLISECONDS);
  const elapsedDays = Math.floor(
    (params.asOf.getTime() - startDate.getTime()) / ONE_DAY_IN_MILLISECONDS,
  );
  if (elapsedDays <= 0) {
    return { weeks: 0, days: 0 };
  }
  return {
    weeks: Math.floor(elapsedDays / DAYS_IN_WEEK),
    days: elapsedDays % DAYS_IN_WEEK,
  };
}
