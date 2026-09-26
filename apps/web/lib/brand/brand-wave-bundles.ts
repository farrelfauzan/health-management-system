import type { BrandWaveBundle } from '#lib/brand/brand-wave-bundle';

/**
 * The four ribbons of the MetaKlinik mark, back to front: violet and sky are
 * the connecting waves, teal is the patient, blue is the care team. Each
 * ribbon is the band between an inner and an outer closed curve; where the
 * two curves cross, the ribbon pinches and looks twisted.
 */
export const BRAND_WAVE_BUNDLES: readonly BrandWaveBundle[] = [
  {
    radius: 59,
    inner: [
      { frequency: 1, amplitude: 3.0, phase: 1.4079 },
      { frequency: 2, amplitude: 5.5, phase: 5.857 },
      { frequency: 3, amplitude: 3.0, phase: 5.9393 },
      { frequency: 5, amplitude: 2.0, phase: 0.1429 },
    ],
    outer: [
      { frequency: 1, amplitude: 4.2, phase: 5.3186 },
      { frequency: 2, amplitude: 7.7, phase: 4.4863 },
      { frequency: 3, amplitude: 4.2, phase: 4.2697 },
      { frequency: 5, amplitude: 2.8, phase: 0.0664 },
    ],
    ripplePhase: 3.059,
    gradient: { from: '#5B45F0', to: '#8E7BFF', x1: 30, y1: 170, x2: 170, y2: 30 },
  },
  {
    radius: 55,
    inner: [
      { frequency: 1, amplitude: 2.0, phase: 2.3928 },
      { frequency: 2, amplitude: 4.0, phase: 1.4489 },
      { frequency: 3, amplitude: 5.0, phase: 1.0427 },
      { frequency: 4, amplitude: 2.0, phase: 5.7389 },
    ],
    outer: [
      { frequency: 1, amplitude: 2.8, phase: 3.6295 },
      { frequency: 2, amplitude: 5.6, phase: 4.334 },
      { frequency: 3, amplitude: 7.0, phase: 3.4732 },
      { frequency: 4, amplitude: 2.8, phase: 2.4087 },
    ],
    ripplePhase: 5.1309,
    gradient: { from: '#0891D1', to: '#5FD4F5', x1: 100, y1: 20, x2: 100, y2: 180 },
  },
  {
    radius: 58,
    inner: [
      { frequency: 1, amplitude: 2.5, phase: 5.8082 },
      { frequency: 2, amplitude: 4.5, phase: 5.9572 },
      { frequency: 3, amplitude: 4.0, phase: 5.6045 },
      { frequency: 5, amplitude: 1.5, phase: 0.5247 },
    ],
    outer: [
      { frequency: 1, amplitude: 3.5, phase: 3.7179 },
      { frequency: 2, amplitude: 6.3, phase: 2.6611 },
      { frequency: 3, amplitude: 5.6, phase: 3.329 },
      { frequency: 5, amplitude: 2.1, phase: 0.8183 },
    ],
    ripplePhase: 1.8314,
    gradient: { from: '#079C80', to: '#22C3B0', x1: 180, y1: 30, x2: 30, y2: 170 },
  },
  {
    radius: 56,
    inner: [
      { frequency: 1, amplitude: 2.0, phase: 2.0337 },
      { frequency: 2, amplitude: 5.0, phase: 0.9473 },
      { frequency: 3, amplitude: 3.5, phase: 4.0879 },
      { frequency: 4, amplitude: 1.5, phase: 0.4549 },
    ],
    outer: [
      { frequency: 1, amplitude: 2.8, phase: 3.3653 },
      { frequency: 2, amplitude: 7.0, phase: 2.2965 },
      { frequency: 3, amplitude: 4.9, phase: 0.3642 },
      { frequency: 4, amplitude: 2.1, phase: 3.1867 },
    ],
    ripplePhase: 0.9207,
    gradient: { from: '#2448F0', to: '#2F9BFF', x1: 20, y1: 40, x2: 180, y2: 160 },
  },
];
