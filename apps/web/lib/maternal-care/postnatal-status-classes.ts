import type { PostnatalWindowStatus } from '@hms/shared-types';

/** One colour per window status, in the trimester schedule's palette (P25-T12). */
export const POSTNATAL_STATUS_CLASSES: Readonly<Record<PostnatalWindowStatus, string>> = {
  FULFILLED: 'bg-success-tint text-success',
  DUE: 'bg-warning-tint text-warning',
  UPCOMING: 'bg-slate-100 text-slate-600',
  MISSED: 'bg-danger-tint text-danger',
};
