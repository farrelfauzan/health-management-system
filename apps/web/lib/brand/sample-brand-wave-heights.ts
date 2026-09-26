import type { BrandWaveNoise } from '#lib/brand/brand-wave-noise';

const RESTING_BULGE = 3;
const FULL_TURN = Math.PI * 2;

/** The bulge at each compass point of each ribbon, `seconds` into the listening motion. */
export function sampleBrandWaveHeights(noise: BrandWaveNoise, seconds: number): number[][] {
  return noise.map((ribbon) =>
    ribbon.map((terms) =>
      terms.reduce(
        (total, term) =>
          total + term.amplitude * Math.sin(term.frequency * FULL_TURN * seconds + term.phase),
        RESTING_BULGE,
      ),
    ),
  );
}
