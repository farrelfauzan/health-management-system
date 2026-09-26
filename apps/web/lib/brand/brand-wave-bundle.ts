/** One sine term of a ribbon edge: `amplitude * sin(frequency * angle + phase)`. */
type BrandWaveHarmonic = {
  readonly frequency: number;
  readonly amplitude: number;
  readonly phase: number;
};

/** A linear gradient in the mark's 200 × 200 coordinate space. */
type BrandWaveGradient = {
  readonly from: string;
  readonly to: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

/**
 * One ribbon of the MetaKlinik mark: the band between an inner and an outer
 * closed curve drawn around the centre of the mark.
 */
export type BrandWaveBundle = {
  readonly radius: number;
  readonly inner: readonly BrandWaveHarmonic[];
  readonly outer: readonly BrandWaveHarmonic[];
  readonly ripplePhase: number;
  readonly gradient: BrandWaveGradient;
};
