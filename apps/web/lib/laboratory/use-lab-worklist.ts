import type { LabWorklistItem } from '@hms/shared-types';

import {
  getLabWorklistControllerListWorklistV1QueryKey,
  labWorklistControllerListWorklistV1,
} from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { useApiQuery } from '#lib/api/use-api-query';
import { LAB_WORKLIST_POLL_INTERVAL_MS } from '#lib/laboratory/lab-worklist-buckets';
import type { LabWorklistSearchParams } from '#lib/laboratory/worklist-search-params';

/**
 * One tab of the bench's list, re-read every half minute while the tab is
 * visible (P18-T08). Not in the background: a screen nobody is looking at
 * has no reason to poll, and a bench PC left on the worklist overnight
 * should not hammer the API.
 */
export function useLabWorklist(params: LabWorklistSearchParams) {
  const query = {
    bucket: params.bucket,
    ...(params.date ? { date: params.date } : {}),
  };
  const result = useApiQuery<LabWorklistItem[]>({
    queryKey: getLabWorklistControllerListWorklistV1QueryKey(query),
    queryFn: (signal) => labWorklistControllerListWorklistV1(query, signal),
    errorMessage: 'Unable to load the laboratory worklist.',
    options: {
      refetchInterval: LAB_WORKLIST_POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    },
  });

  return { ...result, items: result.data ?? [] };
}
