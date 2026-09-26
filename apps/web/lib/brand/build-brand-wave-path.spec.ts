import { describe, expect, it } from 'vitest';

import type { BrandWaveBundle } from '#lib/brand/brand-wave-bundle';
import { BRAND_WAVE_BUNDLES } from '#lib/brand/brand-wave-bundles';
import { buildBrandWavePath } from '#lib/brand/build-brand-wave-path';
import { createBrandWaveNoise } from '#lib/brand/create-brand-wave-noise';
import { sampleBrandWaveHeights } from '#lib/brand/sample-brand-wave-heights';

const [inputBundle] = BRAND_WAVE_BUNDLES as [BrandWaveBundle, ...BrandWaveBundle[]];
const inputHeights = [9, -3, 6, 0, 10, -2, 4, 1];

function readRadii(path: string): number[] {
  const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pairs = numbers.flatMap((value, index) =>
    index % 2 === 0 ? [[value, numbers[index + 1] ?? 100] as const] : [],
  );
  return pairs.map(([x, y]) => Math.hypot(x - 100, y - 100));
}

describe('buildBrandWavePath', () => {
  it('draws the ribbon as an outer and an inner closed curve', () => {
    const actualPath = buildBrandWavePath({ bundle: inputBundle, energy: 0 });

    expect(actualPath.match(/M/g)).toHaveLength(2);
    expect(actualPath.match(/Z/g)).toHaveLength(2);
  });

  it('ignores the bulges while the mark is at rest', () => {
    const expectedPath = buildBrandWavePath({ bundle: inputBundle, energy: 0 });

    const actualPath = buildBrandWavePath({
      bundle: inputBundle,
      energy: 0,
      heights: inputHeights,
    });

    expect(actualPath).toBe(expectedPath);
  });

  it('bulges further from the centre once the mark is listening', () => {
    const restingRadii = readRadii(buildBrandWavePath({ bundle: inputBundle, energy: 0 }));

    const listeningRadii = readRadii(
      buildBrandWavePath({ bundle: inputBundle, energy: 1, heights: inputHeights }),
    );

    expect(Math.max(...listeningRadii)).toBeGreaterThan(Math.max(...restingRadii));
  });

  it('keeps the calm ring inside the 200 × 200 mark', () => {
    const actualRadii = BRAND_WAVE_BUNDLES.flatMap((bundle) =>
      readRadii(buildBrandWavePath({ bundle, energy: 0 })),
    );

    expect(Math.max(...actualRadii)).toBeLessThan(100);
  });
});

describe('sampleBrandWaveHeights', () => {
  it('moves smoothly from one frame to the next', () => {
    const inputNoise = createBrandWaveNoise(BRAND_WAVE_BUNDLES.length, () => 0.5);
    const frameSeconds = 1 / 60;

    const actualFirst = sampleBrandWaveHeights(inputNoise, 1).flat();
    const actualNext = sampleBrandWaveHeights(inputNoise, 1 + frameSeconds).flat();

    const largestStep = Math.max(
      ...actualFirst.map((height, index) => Math.abs(height - (actualNext[index] ?? height))),
    );
    expect(largestStep).toBeLessThan(1);
  });
});
