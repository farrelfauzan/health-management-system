import type { BrandWaveBundle } from '#lib/brand/brand-wave-bundle';

type BuildBrandWavePathInput = {
  bundle: BrandWaveBundle;
  /** How far the mark is into its listening state: 0 is the calm ring, 1 is fully alive. */
  energy: number;
  /** Bulge height at each of the eight compass points, in mark units. Ignored at energy 0. */
  heights?: readonly number[];
};

type Point = readonly [number, number];

const CENTRE = 100;
const SAMPLE_COUNT = 36;
const OUTER_OFFSET = 5;
const CALM_HARMONIC_SCALE = 0.3;
const RIPPLE_FREQUENCY = 5;
const RIPPLE_AMPLITUDE = 1.6;
const OUTER_RIPPLE_SHIFT = 2.3;
const BULGE_WIDTH = 0.42;
const FULL_TURN = Math.PI * 2;

function sumHarmonics(input: {
  bundle: BrandWaveBundle;
  edge: 'inner' | 'outer';
  angle: number;
  energy: number;
}): number {
  const { bundle, edge, angle, energy } = input;
  const scale = CALM_HARMONIC_SCALE + (1 - CALM_HARMONIC_SCALE) * energy;
  const baseRadius = edge === 'inner' ? bundle.radius : bundle.radius + OUTER_OFFSET;
  const rippleShift = edge === 'inner' ? 0 : OUTER_RIPPLE_SHIFT;
  const ripple =
    RIPPLE_AMPLITUDE *
    (1 - energy) *
    Math.sin(RIPPLE_FREQUENCY * angle + bundle.ripplePhase + rippleShift);
  return bundle[edge].reduce(
    (total, harmonic) =>
      total + harmonic.amplitude * scale * Math.sin(harmonic.frequency * angle + harmonic.phase),
    baseRadius + ripple,
  );
}

function sumBulges(angle: number, heights: readonly number[]): number {
  return heights.reduce((total, height, index) => {
    const centre = (index * FULL_TURN) / heights.length;
    const distance = ((((angle - centre + Math.PI) % FULL_TURN) + FULL_TURN) % FULL_TURN) - Math.PI;
    return total + height * Math.exp(-(distance * distance) / (2 * BULGE_WIDTH * BULGE_WIDTH));
  }, 0);
}

function sampleEdge(input: BuildBrandWavePathInput & { edge: 'inner' | 'outer' }): Point[] {
  const { bundle, energy, heights = [], edge } = input;
  const bulgeWeight = edge === 'inner' ? 0.75 : 1.25;
  return Array.from({ length: SAMPLE_COUNT }, (_, index): Point => {
    const angle = (index * FULL_TURN) / SAMPLE_COUNT;
    const radius =
      sumHarmonics({ bundle, edge, angle, energy }) +
      sumBulges(angle, heights) * energy * bulgeWeight;
    return [CENTRE + radius * Math.cos(angle), CENTRE + radius * Math.sin(angle)];
  });
}

function formatNumber(value: number): string {
  return value.toFixed(1);
}

/** The point at `index` on a closed curve, wrapping past either end. */
function getWrappedPoint(points: readonly Point[], index: number): Point {
  const point = points[(index + points.length) % points.length];
  if (point === undefined) {
    throw new Error('A brand wave curve needs at least one point.');
  }
  return point;
}

/** A closed Catmull-Rom curve through the points, written as cubic Béziers. */
function toClosedCurve(points: readonly Point[]): string {
  const segments = points.map((current, index) => {
    const previous = getWrappedPoint(points, index - 1);
    const next = getWrappedPoint(points, index + 1);
    const afterNext = getWrappedPoint(points, index + 2);
    const control1 = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6,
    ];
    const control2 = [
      next[0] - (afterNext[0] - current[0]) / 6,
      next[1] - (afterNext[1] - current[1]) / 6,
    ];
    return `C${control1.map(formatNumber).join(' ')} ${control2.map(formatNumber).join(' ')} ${next.map(formatNumber).join(' ')}`;
  });
  return `M${getWrappedPoint(points, 0).map(formatNumber).join(' ')}${segments.join('')}Z`;
}

/**
 * The SVG path of one ribbon of the MetaKlinik mark: its outer edge, then its
 * inner edge drawn backwards, filled with the even-odd rule. At energy 0 the
 * ribbon is the calm, nearly round ring of the static logo; as energy rises
 * the curves open up and the eight compass points bulge by `heights`.
 */
export function buildBrandWavePath(input: BuildBrandWavePathInput): string {
  const outer = sampleEdge({ ...input, edge: 'outer' });
  const inner = sampleEdge({ ...input, edge: 'inner' });
  return `${toClosedCurve(outer)} ${toClosedCurve([...inner].reverse())}`;
}
