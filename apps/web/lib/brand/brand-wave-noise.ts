/** One slow sine the bulge of a compass point rides on. Frequency is in cycles per second. */
type BrandWaveNoiseTerm = {
  readonly amplitude: number;
  readonly frequency: number;
  readonly phase: number;
};

/** Per ribbon, per compass point, the three sines whose sum is that point's bulge. */
export type BrandWaveNoise = readonly (readonly (readonly BrandWaveNoiseTerm[])[])[];
