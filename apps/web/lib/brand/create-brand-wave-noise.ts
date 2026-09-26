import type { BrandWaveNoise } from '#lib/brand/brand-wave-noise';

const COMPASS_POINTS = 8;
const FULL_TURN = Math.PI * 2;
const NOISE_BANDS = [
  { amplitude: 4, minFrequency: 0.35, spread: 0.25 },
  { amplitude: 2.5, minFrequency: 0.7, spread: 0.4 },
  { amplitude: 1.5, minFrequency: 1.2, spread: 0.5 },
] as const;

/**
 * Random but smooth motion for the listening logo: every compass point of
 * every ribbon gets its own three slow sines, so the bulges rise and fall
 * without ever jumping and never repeat in step with each other.
 */
export function createBrandWaveNoise(
  ribbonCount: number,
  random: () => number = Math.random,
): BrandWaveNoise {
  return Array.from({ length: ribbonCount }, () =>
    Array.from({ length: COMPASS_POINTS }, () =>
      NOISE_BANDS.map((band) => ({
        amplitude: band.amplitude,
        frequency: band.minFrequency + random() * band.spread,
        phase: random() * FULL_TURN,
      })),
    ),
  );
}
