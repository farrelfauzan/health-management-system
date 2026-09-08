import { describe, expect, it } from 'vitest';

import { canCancelLabOrder, toLabOrderStepIndex } from './lab-order-status-steps';

describe('lab order status steps', () => {
  it('places each status on the timeline in the order a day goes through them', () => {
    expect(toLabOrderStepIndex('ORDERED')).toBe(0);
    expect(toLabOrderStepIndex('COLLECTED')).toBe(1);
    expect(toLabOrderStepIndex('RESULTED')).toBe(2);
    expect(toLabOrderStepIndex('RELEASED')).toBe(3);
  });

  // From the doctor's side "the tube is at the bench" and "the bench has
  // started" are the same wait, and a step nobody can act on is a step worth
  // not drawing.
  it('folds IN_PROGRESS into the collected step', () => {
    expect(toLabOrderStepIndex('IN_PROGRESS')).toBe(toLabOrderStepIndex('COLLECTED'));
  });

  it('offers withdrawal only while nothing has been measured', () => {
    expect(canCancelLabOrder('ORDERED')).toBe(true);
    expect(canCancelLabOrder('COLLECTED')).toBe(true);
    expect(canCancelLabOrder('IN_PROGRESS')).toBe(false);
    expect(canCancelLabOrder('RESULTED')).toBe(false);
    expect(canCancelLabOrder('RELEASED')).toBe(false);
    expect(canCancelLabOrder('CANCELLED')).toBe(false);
  });
});
