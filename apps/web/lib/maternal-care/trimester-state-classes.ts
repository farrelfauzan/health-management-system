import type { TrimesterScheduleState } from '@hms/shared-types';

/**
 * DUE is deliberately neutral rather than a warning colour: a mother at twenty
 * weeks with one second-trimester visit has not missed anything, and a screen
 * that says otherwise teaches the midwife to ignore it.
 */
export const TRIMESTER_STATE_CLASSES: Readonly<Record<TrimesterScheduleState, string>> = {
  DONE: 'bg-success-tint text-success',
  DUE: 'bg-slate-100 text-slate-600',
  MISSED: 'bg-danger-tint text-danger',
};
