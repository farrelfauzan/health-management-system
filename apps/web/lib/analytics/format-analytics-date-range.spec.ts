import { describe, expect, it } from 'vitest';

import { formatAnalyticsDateRange } from './format-analytics-date-range';

const formatDate = (value: Date, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat('id', options).format(value);

describe('formatAnalyticsDateRange', () => {
  it.each([
    [{ from: '2026-09-01', to: '2026-09-30' }, '1 – 30 Sep 2026'],
    [{ from: '2026-08-04', to: '2026-09-02' }, '4 Agu – 2 Sep 2026'],
    [{ from: '2025-09-29', to: '2026-09-28' }, '29 Sep 2025 – 28 Sep 2026'],
    [{ from: '2026-09-28', to: '2026-09-28' }, '28 Sep 2026'],
  ])('writes %p as %s', (inputRange, expected) => {
    expect(formatAnalyticsDateRange(inputRange, formatDate)).toBe(expected);
  });
});
