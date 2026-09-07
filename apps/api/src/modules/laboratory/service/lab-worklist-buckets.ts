import { LabOrderStatusValue, LabWorklistBucketValue } from '@hms/shared-types';

/**
 * The four things the bench looks at, mapped to the order statuses behind them
 * (P18-T03).
 *
 * Buckets rather than raw statuses because the analis's question is about work
 * to do, not about a column: *in-progress* covers a tube that has been drawn
 * and one that is on the analyser, and *to-validate* means results are in and
 * nobody has signed them out — which no status name would have suggested.
 */
export const WORKLIST_STATUSES_BY_BUCKET: Readonly<
  Record<LabWorklistBucketValue, readonly LabOrderStatusValue[]>
> = {
  'to-collect': ['ORDERED'],
  'in-progress': ['COLLECTED', 'IN_PROGRESS'],
  'to-validate': ['RESULTED'],
  released: ['RELEASED'],
};
