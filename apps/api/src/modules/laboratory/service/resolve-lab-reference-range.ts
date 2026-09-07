import {
  LabReferenceRangeRecord,
  LabResultPatientContext,
  LabResultRangeSnapshot,
} from '@hms/shared-types';

/**
 * The band that applied to this patient for this test, at the moment the
 * sample was taken (P18-T04).
 *
 * Age is measured **at collection**, not at entry and not today: a sample drawn
 * from a three-week-old and typed in a fortnight later is judged against the
 * neonatal band, because that is who the patient was when the blood was in the
 * tube.
 *
 * Candidates are the rows whose sex and age band contain the patient. When
 * more than one does, the most specific wins — a sexed band beats an unsexed
 * one, and a narrower age band beats a wider one — so a catalog that carries
 * both a general adult range and a paediatric refinement uses the refinement
 * for the child. When none does, the answer is `null`: the result is recorded
 * and shown without a flag rather than judged against a range meant for
 * somebody else.
 */
export function resolveLabReferenceRange(
  ranges: readonly LabReferenceRangeRecord[],
  patient: LabResultPatientContext,
): LabResultRangeSnapshot | null {
  const candidates = ranges
    .filter((range) => matchesSex(range, patient.sex))
    .filter((range) => matchesAge(range, patient.ageDaysAtCollection));
  if (candidates.length === 0) {
    return null;
  }
  const best = [...candidates].sort(compareSpecificity)[0];
  if (best === undefined) {
    return null;
  }

  return {
    refLow: best.low,
    refHigh: best.high,
    refCriticalLow: best.criticalLow,
    refCriticalHigh: best.criticalHigh,
    refText: best.textNormal,
  };
}

/** A row with no sex applies to everyone; a sexed row applies to that sex only. */
function matchesSex(range: LabReferenceRangeRecord, sex: 'MALE' | 'FEMALE'): boolean {
  return range.sex === null || range.sex === sex;
}

/**
 * Bounds are inclusive on both ends, and a null bound is unbounded — so the
 * common adult row, with neither bound set, matches every age. An unknown age
 * matches only unbanded rows: guessing which band a patient falls into is the
 * one thing this function must not do.
 */
function matchesAge(range: LabReferenceRangeRecord, ageDays: number | null): boolean {
  if (range.ageMinDays === null && range.ageMaxDays === null) {
    return true;
  }
  if (ageDays === null) {
    return false;
  }

  return (
    (range.ageMinDays === null || ageDays >= range.ageMinDays) &&
    (range.ageMaxDays === null || ageDays <= range.ageMaxDays)
  );
}

/** Sexed before unsexed, then narrower age span first. */
function compareSpecificity(
  left: LabReferenceRangeRecord,
  right: LabReferenceRangeRecord,
): number {
  const sexRank = Number(right.sex !== null) - Number(left.sex !== null);
  if (sexRank !== 0) {
    return sexRank;
  }

  return toAgeSpan(left) - toAgeSpan(right);
}

function toAgeSpan(range: LabReferenceRangeRecord): number {
  if (range.ageMinDays === null && range.ageMaxDays === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (range.ageMaxDays ?? Number.MAX_SAFE_INTEGER) - (range.ageMinDays ?? 0);
}
