import type { LabWorklistBucketValue } from '@hms/shared-types';

/**
 * The four tabs of the bench's day, in the order the day goes through them
 * (P18-T08). The values are the API's bucket names, so the tab in the URL is
 * the query the worklist route answers.
 */
export const LAB_WORKLIST_BUCKETS: readonly LabWorklistBucketValue[] = [
  'to-collect',
  'in-progress',
  'to-validate',
  'released',
] as const;

export const DEFAULT_LAB_WORKLIST_BUCKET: LabWorklistBucketValue = 'to-collect';

/** How often the list re-reads itself: a tube drawn at the chair shows at the bench inside half a minute. */
export const LAB_WORKLIST_POLL_INTERVAL_MS = 30_000;

export function isLabWorklistBucket(value: string | undefined): value is LabWorklistBucketValue {
  return LAB_WORKLIST_BUCKETS.some((bucket) => bucket === value);
}
