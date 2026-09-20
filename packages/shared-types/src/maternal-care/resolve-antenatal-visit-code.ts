import type { AntenatalVisitCodeValue, PregnancyTrimester } from '#maternal-care/types';

/** `K2`–`K6` by position; the first visit is decided by trimester instead. */
const SEQUENTIAL_CODES: readonly AntenatalVisitCodeValue[] = ['K2', 'K3', 'K4', 'K5', 'K6'];
const FIRST_VISIT_ORDINAL = 1;

/**
 * The SATUSEHAT ANC code for the n-th visit of an episode (P25-T06).
 *
 * The first visit is `K1M` when the mother booked inside trimester 1 and
 * `K1A` when she booked later. **No regulation or SATUSEHAT page defines
 * "K1 murni" and "K1 akses"** (P25-T01 answer 3): this twelve-week split is a
 * programme convention, stated here so that a reader knows it is ours to
 * change, and product is confirming it with the pilot puskesmas.
 *
 * Visits 2 to 6 are `K2` to `K6`. A seventh or later visit returns **null**,
 * because the published code system stops at `K6` — such visits are still
 * numbered internally, and P25-T08 decides what, if anything, goes upstream
 * for them. `K6` is never reused.
 */
export function resolveAntenatalVisitCode(params: {
  ordinal: number;
  firstVisitTrimester: PregnancyTrimester | null;
}): AntenatalVisitCodeValue | null {
  if (params.ordinal === FIRST_VISIT_ORDINAL) {
    return params.firstVisitTrimester === 1 ? 'K1M' : 'K1A';
  }
  return SEQUENTIAL_CODES[params.ordinal - 2] ?? null;
}
