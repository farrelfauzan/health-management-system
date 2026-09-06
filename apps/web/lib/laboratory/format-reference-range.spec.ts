import { describe, expect, it } from 'vitest';

import { formatReferenceRange } from './format-reference-range';

describe('formatReferenceRange', () => {
  it('renders a two-sided range', () => {
    expect(formatReferenceRange({ id: 'r', low: 13.2, high: 17.3 })).toBe('13.2 – 17.3');
  });

  it('renders a floor-only range, which is how HDL is written', () => {
    expect(formatReferenceRange({ id: 'r', low: 40 })).toBe('≥ 40');
  });

  it('renders a ceiling-only range, which is how LDL is written', () => {
    expect(formatReferenceRange({ id: 'r', high: 100 })).toBe('≤ 100');
  });

  it('prefers the recorded normal text for a coded test', () => {
    expect(formatReferenceRange({ id: 'r', textNormal: 'Negatif', low: 1 })).toBe('Negatif');
  });

  it('returns null for a range that says nothing, so the caller can say so', () => {
    expect(formatReferenceRange({ id: 'r' })).toBeNull();
  });

  it('keeps a zero floor, which is not the same as no floor', () => {
    expect(formatReferenceRange({ id: 'r', low: 0, high: 40 })).toBe('0 – 40');
  });
});
