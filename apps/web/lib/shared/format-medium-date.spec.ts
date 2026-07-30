import { describe, expect, it } from 'vitest';

import { formatMediumDate } from './format-medium-date';

describe('formatMediumDate', () => {
  it('formats valid dates for the requested locale', () => {
    expect(formatMediumDate('2026-07-30T12:00:00.000Z', 'id')).toBe('30 Jul 2026');
    expect(formatMediumDate('2026-07-30T12:00:00.000Z', 'en')).toBe('Jul 30, 2026');
  });

  it('returns the empty placeholder for an invalid date', () => {
    expect(formatMediumDate('not-a-date', 'id')).toBe('-');
  });
});
