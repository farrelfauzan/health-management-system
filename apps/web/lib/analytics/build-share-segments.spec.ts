import { describe, expect, it } from 'vitest';

import { buildShareSegments } from './build-share-segments';

const COLOR = { swatchClassName: 'bg-primary', fill: 'var(--color-primary)' };

describe('buildShareSegments', () => {
  it('rounds shares so they always add up to 100', () => {
    const actual = buildShareSegments([
      { key: 'a', label: 'A', value: 1, color: COLOR },
      { key: 'b', label: 'B', value: 1, color: COLOR },
      { key: 'c', label: 'C', value: 1, color: COLOR },
    ]);

    expect(actual.map((segment) => segment.percent)).toEqual([34, 33, 33]);
  });

  it('gives every segment 0% when there is nothing to share', () => {
    const actual = buildShareSegments([{ key: 'a', label: 'A', value: 0, color: COLOR }]);

    expect(actual[0]?.percent).toBe(0);
  });
});
