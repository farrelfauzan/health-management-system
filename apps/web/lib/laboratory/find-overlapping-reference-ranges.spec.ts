import { describe, expect, it } from 'vitest';

import { findOverlappingReferenceRanges } from './find-overlapping-reference-ranges';

/**
 * P18-T15. The editor refuses a set where one patient could fall into two
 * bands, because the API stores whatever it is given and the flag on a result
 * would then depend on which band happened to be found first.
 */
describe('findOverlappingReferenceRanges', () => {
  it('lets a male and a female band share the same ages', () => {
    const actual = findOverlappingReferenceRanges([
      { sex: 'MALE', low: 13.2, high: 17.3 },
      { sex: 'FEMALE', low: 11.7, high: 15.5 },
    ]);

    expect(actual).toBeNull();
  });

  it('lets adjacent age bands meet edge to edge without colliding', () => {
    const actual = findOverlappingReferenceRanges([
      { ageMinDays: 0, ageMaxDays: 364, low: 9.5, high: 14 },
      { ageMinDays: 365, low: 12, high: 16 },
    ]);

    expect(actual).toBeNull();
  });

  it('refuses two bands for the same sex whose ages overlap', () => {
    const actual = findOverlappingReferenceRanges([
      { sex: 'FEMALE', ageMinDays: 0, ageMaxDays: 6570, low: 11, high: 15 },
      { sex: 'FEMALE', ageMinDays: 3650, low: 12, high: 16 },
    ]);

    expect(actual).toEqual({ firstIndex: 0, secondIndex: 1 });
  });

  // A band with no sex applies to everybody, so it collides with a sexed
  // band over the same ages — a woman would match both.
  it('treats a band for everybody as colliding with a sexed band over the same ages', () => {
    const actual = findOverlappingReferenceRanges([
      { low: 12, high: 16 },
      { sex: 'MALE', low: 13, high: 17 },
    ]);

    expect(actual).toEqual({ firstIndex: 0, secondIndex: 1 });
  });

  it('reports the first colliding pair among many', () => {
    const actual = findOverlappingReferenceRanges([
      { sex: 'MALE', ageMinDays: 0, ageMaxDays: 100 },
      { sex: 'FEMALE', ageMinDays: 0, ageMaxDays: 100 },
      { sex: 'FEMALE', ageMinDays: 50 },
    ]);

    expect(actual).toEqual({ firstIndex: 1, secondIndex: 2 });
  });

  it('is fine with an empty set', () => {
    expect(findOverlappingReferenceRanges([])).toBeNull();
  });
});
