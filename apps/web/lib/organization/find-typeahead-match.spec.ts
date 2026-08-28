import { describe, expect, it } from 'vitest';

import { findTypeaheadMatch } from './find-typeahead-match';

const NAMES = ['Poli Umum', 'Poli Gigi', 'Bangsal Melati', 'Poli Anak'];

describe('findTypeaheadMatch', () => {
  it('finds the next match after the focused row', () => {
    expect(findTypeaheadMatch(NAMES, 0, 'p')).toBe(1);
  });

  it('cycles through every match on repeated presses', () => {
    // The whole reason typeahead earns its place on a chart where a dozen units
    // begin with "Poli": pressing P repeatedly walks them rather than sticking.
    expect(findTypeaheadMatch(NAMES, 1, 'p')).toBe(3);
    expect(findTypeaheadMatch(NAMES, 3, 'p')).toBe(0);
  });

  it('wraps past the end of the list', () => {
    expect(findTypeaheadMatch(NAMES, 3, 'b')).toBe(2);
  });

  it('is case-insensitive in both directions', () => {
    expect(findTypeaheadMatch(NAMES, 0, 'P')).toBe(1);
    expect(findTypeaheadMatch(['ICU Ward'], 0, 'i')).toBe(0);
  });

  it('returns -1 when nothing starts with the character', () => {
    expect(findTypeaheadMatch(NAMES, 0, 'z')).toBe(-1);
  });

  it('returns -1 for an empty tree rather than looping', () => {
    expect(findTypeaheadMatch([], 0, 'a')).toBe(-1);
  });
});
