import type { MaternalDueRange } from '#maternal-visit-due/types';

/**
 * Whether a visit window opens or closes inside the range (P25-T17). A window
 * that merely spans the whole range — KF3 runs 21 days — is not "due this
 * week" in any sense a reminder could act on, so it is left out; one that
 * opens this week, or is about to close, is.
 */
export function doesDueWindowTouchRange(params: {
  dueFrom: string;
  dueUntil: string;
  range: MaternalDueRange;
}): boolean {
  const isInRange = (date: string): boolean => date >= params.range.from && date <= params.range.to;
  return isInRange(params.dueFrom) || isInRange(params.dueUntil);
}
