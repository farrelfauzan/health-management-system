import {
  computeChangePercent,
  computeNoShowRatePercent,
  listAnalyticsBuckets,
} from '@hms/shared-types';

describe('computeChangePercent', () => {
  it.each([
    [150, 120, 25],
    [90, 120, -25],
    [120, 120, 0],
    [1, 3, -66.7],
  ])('answers %i against %i as %p', (inputCurrent, inputPrevious, expected) => {
    expect(computeChangePercent(inputCurrent, inputPrevious)).toBe(expected);
  });

  it('has no percentage for growth from nothing', () => {
    expect(computeChangePercent(12, 0)).toBeNull();
  });
});

describe('computeNoShowRatePercent', () => {
  it('answers 25 for 30 completed and 10 no-shows', () => {
    expect(computeNoShowRatePercent({ completed: 30, noShows: 10 })).toBe(25);
  });

  it('answers null when nobody was due', () => {
    expect(computeNoShowRatePercent({ completed: 0, noShows: 0 })).toBeNull();
  });
});

describe('listAnalyticsBuckets', () => {
  it('lists every day of September', () => {
    const actual = listAnalyticsBuckets({ from: '2026-09-01', to: '2026-09-30' }, 'day');

    expect(actual).toHaveLength(30);
    expect(actual[29]).toBe('2026-09-30');
  });

  it('starts weeks on the Monday on or before the first day, like date_trunc', () => {
    // 1 September 2026 is a Tuesday.
    const actual = listAnalyticsBuckets({ from: '2026-09-01', to: '2026-10-12' }, 'week');

    expect(actual[0]).toBe('2026-08-31');
    expect(actual[actual.length - 1]).toBe('2026-10-12');
  });

  it('lists twelve months from October to September', () => {
    const actual = listAnalyticsBuckets({ from: '2025-10-01', to: '2026-09-30' }, 'month');

    expect(actual).toHaveLength(12);
    expect(actual[0]).toBe('2025-10-01');
    expect(actual[11]).toBe('2026-09-01');
  });
});
