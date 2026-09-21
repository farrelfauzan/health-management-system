import type { ShkScreeningView } from '@hms/shared-types';

import {
  getShkScreeningControllerListWorklistV1QueryKey,
  shkScreeningControllerListWorklistV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';
import type { ShkWorklistTab } from '#lib/maternal-care/shk-worklist-tabs';

/** A minute: DUE turns OVERDUE by the clock alone, so the list re-reads itself. */
const SHK_WORKLIST_POLL_INTERVAL_MS = 60_000;

/** One tab of the SHK worklist (P25-T10), re-read while it is on screen. */
export function useShkWorklist(tab: ShkWorklistTab) {
  const params = tab === 'ALL' ? {} : { status: tab };
  const result = useApiQuery<ShkScreeningView[]>({
    queryKey: getShkScreeningControllerListWorklistV1QueryKey(params),
    queryFn: (signal) => shkScreeningControllerListWorklistV1(params, signal),
    errorMessage: 'Unable to load the SHK worklist.',
    options: {
      refetchInterval: SHK_WORKLIST_POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    },
  });

  return { ...result, items: result.data ?? [] };
}
