import { computePercentile } from './compute-percentile';

describe('computePercentile', () => {
  const inputSamples = Array.from({ length: 20 }, (_, index) => index + 1);

  it('answers the nineteenth of twenty runs for p95', () => {
    expect(computePercentile(inputSamples, 95)).toBe(19);
  });

  it('answers the median rank for p50', () => {
    expect(computePercentile(inputSamples, 50)).toBe(10);
  });

  it('does not depend on the order the runs finished in', () => {
    expect(computePercentile([30, 10, 20], 100)).toBe(30);
  });

  it('answers zero for no runs', () => {
    expect(computePercentile([], 95)).toBe(0);
  });
});
