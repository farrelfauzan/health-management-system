import { describe, expect, it } from 'vitest';

import { resolveElapsedParts } from './resolve-elapsed-parts';

describe('resolveElapsedParts', () => {
  const READ_AT = '2026-09-28T07:32:00.000Z';

  it.each([
    ['2026-09-28T07:20:00.000Z', { unit: 'minutes', minutes: 12 }],
    ['2026-09-28T05:18:00.000Z', { unit: 'hoursMinutes', hours: 2, minutes: 14 }],
    ['2026-09-25T07:32:00.000Z', { unit: 'days', days: 3 }],
    ['2026-09-28T07:40:00.000Z', { unit: 'minutes', minutes: 0 }],
  ])('measures %s to the read time as %p', (inputSince, expected) => {
    expect(resolveElapsedParts(inputSince, READ_AT)).toEqual(expected);
  });
});
