import type { QueryClient } from '@tanstack/react-query';

import { getChannelArrivalControllerListArrivalsV1QueryKey } from '#lib/api/generated/customer-service/customer-service';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';

/**
 * Refetches the worklist and the patient lists after a merge.
 *
 * Both, because a merge changes two things a desk is looking at: the booking
 * has moved to another record, and a patient row has been retired. Leaving the
 * patient caches alone would keep the merged-away draft visible in a search
 * the admin runs thirty seconds later, which is exactly when they would try to
 * merge it a second time.
 */
export async function invalidateChannelArrivalQueries(queryClient: QueryClient): Promise<void> {
  const [listKeyPrefix] = getChannelArrivalControllerListArrivalsV1QueryKey();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [listKeyPrefix] }),
    invalidatePatientQueries(queryClient),
  ]);
}
