import type { ShkScreeningView } from '@hms/shared-types';

import type { ShkRowAction } from '#lib/maternal-care/shk-row-action';

/**
 * The one step an SHK sample is waiting for, or null once it is resulted or
 * closed as not screened.
 */
export function resolveShkNextAction(screening: ShkScreeningView): ShkRowAction | null {
  if (screening.status === 'RESULTED' || screening.status === 'NOT_SCREENED') {
    return null;
  }
  if (screening.sampleTakenAt === null) {
    return 'sample';
  }
  return screening.sentAt === null ? 'sent' : 'result';
}
