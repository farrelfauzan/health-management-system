import { BRAND_WAVE_BUNDLES } from '#lib/brand/brand-wave-bundles';
import { buildBrandWavePath } from '#lib/brand/build-brand-wave-path';

/** The ribbons of the resting logo: the calm, nearly round ring. Computed once. */
export const BRAND_STATIC_WAVE_PATHS: readonly string[] = BRAND_WAVE_BUNDLES.map((bundle) =>
  buildBrandWavePath({ bundle, energy: 0 }),
);
