import { describe, expect, it } from 'vitest';

import { formatSignedNumber } from './format-signed-number';
import { resolveAnalyticsDelta } from './resolve-analytics-delta';

describe('resolveAnalyticsDelta', () => {
  it('shows visits 1.248 against 1.151 as +8,4%, good news', () => {
    const actual = resolveAnalyticsDelta({
      current: 1248,
      previous: 1151,
      kind: 'percent',
      higherIsBetter: true,
    });

    expect(actual).toEqual({ kind: 'percent', direction: 'up', tone: 'good', value: 8.4 });
  });

  it('shows a no-show rate of 9,6 against 10,8 as −1,2 points, and calls the drop good', () => {
    const actual = resolveAnalyticsDelta({
      current: 9.6,
      previous: 10.8,
      kind: 'points',
      higherIsBetter: false,
    });

    expect(actual).toEqual({ kind: 'points', direction: 'down', tone: 'good', value: -1.2 });
  });

  it('calls a fall in visits bad', () => {
    const actual = resolveAnalyticsDelta({
      current: 90,
      previous: 120,
      kind: 'percent',
      higherIsBetter: true,
    });

    expect(actual).toMatchObject({ direction: 'down', tone: 'bad', value: -25 });
  });

  it('shows a wait of 18 against 15 minutes as +3 minutes, and bad news', () => {
    const actual = resolveAnalyticsDelta({
      current: 18,
      previous: 15,
      kind: 'minutes',
      higherIsBetter: false,
    });

    expect(actual).toEqual({ kind: 'minutes', direction: 'up', tone: 'bad', value: 3 });
  });

  it('calls no change neutral', () => {
    const actual = resolveAnalyticsDelta({
      current: 40,
      previous: 40,
      kind: 'percent',
      higherIsBetter: true,
    });

    expect(actual).toMatchObject({ direction: 'flat', tone: 'neutral', value: 0 });
  });

  it.each([
    [{ current: 12, previous: 0 }],
    [{ current: 12, previous: null }],
    [{ current: null, previous: 10 }],
  ])('shows nothing when there is no honest change: %p', (inputValues) => {
    expect(
      resolveAnalyticsDelta({ ...inputValues, kind: 'percent', higherIsBetter: true }),
    ).toBeNull();
  });
});

describe('formatSignedNumber', () => {
  it.each([
    [8.4, 'id', '+8,4'],
    [-1.2, 'id', '−1,2'],
    [0, 'id', '0'],
    [1234.5, 'id', '+1.234,5'],
    [8.4, 'en', '+8.4'],
  ])('writes %p in %s as %s', (inputValue, inputLocale, expected) => {
    expect(formatSignedNumber(inputValue, inputLocale)).toBe(expected);
  });
});
