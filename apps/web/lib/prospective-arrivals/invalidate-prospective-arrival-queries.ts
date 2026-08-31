import type { QueryClient } from '@tanstack/react-query';

import { getProspectivePatientControllerListProspectivePatientsV1QueryKey } from '#lib/api/generated/customer-service/customer-service';
import { invalidateChannelArrivalQueries } from '#lib/channel-arrivals/invalidate-channel-arrival-queries';

/**
 * Refetches everything a resolved arrival changed (`P17-T04`).
 *
 * Three caches, because resolving one booking moves three screens at once: the
 * prospective list loses a row, the arrival worklist's row stops being a
 * prospective booking and starts naming a patient, and the patient directory
 * has either gained a record or has one with a booking it did not have a
 * moment ago. Leaving any of them stale leaves the desk looking at a row it has
 * already dealt with — which is exactly when somebody resolves it a second
 * time.
 */
export async function invalidateProspectiveArrivalQueries(
  queryClient: QueryClient,
): Promise<void> {
  const [listKeyPrefix] = getProspectivePatientControllerListProspectivePatientsV1QueryKey();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [listKeyPrefix] }),
    invalidateChannelArrivalQueries(queryClient),
  ]);
}
