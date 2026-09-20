import type { GestationalAge, PregnancyTrimester } from '#maternal-care/types';

/** Permenkes 21/2021 Lampiran I, verified by P25-T01 answer 2. */
const FIRST_TRIMESTER_LAST_WEEK = 12;
const SECOND_TRIMESTER_LAST_WEEK = 24;

/**
 * Which trimester a gestational age falls in (P25-T06).
 *
 * The boundaries are inclusive at the top and stated in whole weeks:
 * trimester 1 is 0–12 weeks, trimester 2 is above 12 up to 24, trimester 3 is
 * above 24 until birth. So 12 weeks 6 days is still trimester 1 and 13 weeks
 * 0 days is trimester 2 — which is what the K4/K6 definitions count on, and
 * what makes "K1 murni" mean booked inside the first twelve weeks.
 */
export function resolveTrimester(gestationalAge: GestationalAge): PregnancyTrimester {
  if (gestationalAge.weeks <= FIRST_TRIMESTER_LAST_WEEK) {
    return 1;
  }
  return gestationalAge.weeks <= SECOND_TRIMESTER_LAST_WEEK ? 2 : 3;
}
