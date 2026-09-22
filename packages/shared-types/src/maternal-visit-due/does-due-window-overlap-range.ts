import type { MaternalDueRange } from '#maternal-visit-due/types';

/**
 * Whether a window and the range share at least one day (P25-T17). Used for
 * the short windows — an SHK sample is due over one day — where "opens or
 * closes this week" and "overlaps this week" can only differ by a sample
 * that is already overdue, which the worklist exists to show.
 */
export function doesDueWindowOverlapRange(params: {
  dueFrom: string;
  dueUntil: string;
  range: MaternalDueRange;
}): boolean {
  return params.dueFrom <= params.range.to && params.dueUntil >= params.range.from;
}
