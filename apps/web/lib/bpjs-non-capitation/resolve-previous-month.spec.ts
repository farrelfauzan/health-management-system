import { describe, expect, it } from 'vitest';

import { resolvePreviousMonth } from '#lib/bpjs-non-capitation/resolve-previous-month';

describe('resolvePreviousMonth', () => {
  it('opens on the month the induk files next, across a year boundary', () => {
    expect(resolvePreviousMonth('2026-11-06')).toBe('2026-10');
    expect(resolvePreviousMonth('2027-01-31')).toBe('2026-12');
  });
});
