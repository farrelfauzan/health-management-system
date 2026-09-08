import type { LabWorklistBucketValue } from '@hms/shared-types';

import {
  DEFAULT_LAB_WORKLIST_BUCKET,
  isLabWorklistBucket,
} from '#lib/laboratory/lab-worklist-buckets';

export type LabWorklistSearchParams = {
  bucket: LabWorklistBucketValue;
  /** A clinic day, `YYYY-MM-DD`; absent means every open order regardless of day. */
  date?: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The tab and the day, from the URL, so a reload and a shared link land on
 * the same list (P18-T08). Anything unparseable falls back to the first tab
 * rather than a 400 from the API.
 */
export function parseLabWorklistSearchParams(raw: RawSearchParams): LabWorklistSearchParams {
  const bucket = pickFirst(raw.bucket);
  const date = pickFirst(raw.date);
  return {
    bucket: isLabWorklistBucket(bucket) ? bucket : DEFAULT_LAB_WORKLIST_BUCKET,
    ...(date && ISO_DATE_PATTERN.test(date) ? { date } : {}),
  };
}

export function buildLabWorklistSearchParams(next: LabWorklistSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  params.set('bucket', next.bucket);
  if (next.date) {
    params.set('date', next.date);
  }
  return params;
}
