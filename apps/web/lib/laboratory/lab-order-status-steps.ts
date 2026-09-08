import type { LabOrderStatusValue } from '@hms/shared-types';

/**
 * The four states a request passes through on its way to a result, in the
 * order a working day goes through them (P18-T07).
 *
 * CANCELLED is deliberately not a step: a withdrawn order left the path rather
 * than reaching its end, and drawing it as the last stop would read as
 * completion. The card shows the cancellation and its reason instead.
 */
export const LAB_ORDER_STATUS_STEPS = ['ORDERED', 'COLLECTED', 'RESULTED', 'RELEASED'] as const;

export type LabOrderStatusStep = (typeof LAB_ORDER_STATUS_STEPS)[number];

/**
 * How far along the timeline a status sits. IN_PROGRESS is folded into
 * COLLECTED: from the doctor's side "the tube is at the bench" and "the bench
 * has started" are the same wait, and a step nobody can act on is a step worth
 * not drawing.
 */
export function toLabOrderStepIndex(status: LabOrderStatusValue): number {
  if (status === 'IN_PROGRESS') {
    return LAB_ORDER_STATUS_STEPS.indexOf('COLLECTED');
  }
  const index = LAB_ORDER_STATUS_STEPS.indexOf(status as LabOrderStatusStep);

  return index === -1 ? 0 : index;
}

/** Only an order nothing has been drawn for can still be withdrawn by the doctor. */
export function canCancelLabOrder(status: LabOrderStatusValue): boolean {
  return status === 'ORDERED' || status === 'COLLECTED';
}
