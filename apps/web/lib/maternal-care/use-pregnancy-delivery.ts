import type { DeliveryRecordView } from '@hms/shared-types';

import {
  deliveryRecordControllerGetDeliveryV1,
  getDeliveryRecordControllerGetDeliveryV1QueryKey,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The birth recorded for this pregnancy, with its babies (P25-T09).
 *
 * `null` data is the ordinary "she has not given birth yet" answer, not a
 * failure — the section renders its empty state from it.
 */
export function usePregnancyDelivery(pregnancyEpisodeId: string, isEnabled: boolean) {
  const query = useApiQuery<DeliveryRecordView | null>({
    queryKey: getDeliveryRecordControllerGetDeliveryV1QueryKey(pregnancyEpisodeId),
    queryFn: (signal) => deliveryRecordControllerGetDeliveryV1(pregnancyEpisodeId, signal),
    errorMessage: 'Failed to load the delivery record',
    enabled: isEnabled && pregnancyEpisodeId.length > 0,
  });

  return { ...query, delivery: query.data ?? null };
}
