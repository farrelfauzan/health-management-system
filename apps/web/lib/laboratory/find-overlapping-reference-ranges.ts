import type { LabReferenceRangeInput } from '@hms/shared-types';

export type ReferenceRangeOverlap = {
  firstIndex: number;
  secondIndex: number;
};

/**
 * Two bands collide when a patient could fall into both: their sex scopes
 * meet (the same sex, or either applies to everybody) and their age windows
 * intersect (an open end runs to zero or to infinity). The API refuses
 * nothing here — it stores what it is given — so this is the check that
 * keeps a result from being judged against two answers to "what is normal".
 * Returns the first colliding pair, or null when every band stands alone.
 */
export function findOverlappingReferenceRanges(
  ranges: readonly LabReferenceRangeInput[],
): ReferenceRangeOverlap | null {
  for (let firstIndex = 0; firstIndex < ranges.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < ranges.length; secondIndex += 1) {
      const first = ranges[firstIndex];
      const second = ranges[secondIndex];
      if (first && second && doRangesCollide(first, second)) {
        return { firstIndex, secondIndex };
      }
    }
  }
  return null;
}

function doRangesCollide(first: LabReferenceRangeInput, second: LabReferenceRangeInput): boolean {
  return doSexScopesMeet(first, second) && doAgeWindowsIntersect(first, second);
}

function doSexScopesMeet(first: LabReferenceRangeInput, second: LabReferenceRangeInput): boolean {
  const firstSex = first.sex ?? null;
  const secondSex = second.sex ?? null;
  return firstSex === null || secondSex === null || firstSex === secondSex;
}

function doAgeWindowsIntersect(
  first: LabReferenceRangeInput,
  second: LabReferenceRangeInput,
): boolean {
  const firstMin = first.ageMinDays ?? 0;
  const firstMax = first.ageMaxDays ?? Number.POSITIVE_INFINITY;
  const secondMin = second.ageMinDays ?? 0;
  const secondMax = second.ageMaxDays ?? Number.POSITIVE_INFINITY;
  return firstMin <= secondMax && secondMin <= firstMax;
}
