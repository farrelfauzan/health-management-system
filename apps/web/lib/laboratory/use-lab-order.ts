import type { LabOrderView } from '@hms/shared-types';

import {
  getLabOrderControllerGetLabOrderByIdV1QueryKey,
  labOrderControllerGetLabOrderByIdV1,
} from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { useApiQuery } from '#lib/api/use-api-query';

/** One order in full — items, specimens, disposition — by id. */
export function useLabOrder(labOrderId: string, enabled = true) {
  const result = useApiQuery<LabOrderView>({
    queryKey: getLabOrderControllerGetLabOrderByIdV1QueryKey(labOrderId),
    queryFn: (signal) => labOrderControllerGetLabOrderByIdV1(labOrderId, signal),
    errorMessage: 'Unable to load the laboratory order.',
    enabled,
  });

  return { ...result, labOrder: result.data };
}
