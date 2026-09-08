import type { LabOrderBenchView } from '@hms/shared-types';

import {
  getLabResultControllerGetOrderBenchV1QueryKey,
  labResultControllerGetOrderBenchV1,
} from '#lib/api/generated/laboratory-results/laboratory-results';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The order as the bench works it: the order, the patient identity the entry
 * form previews flags against, and every value typed so far (P18-T08).
 */
export function useLabOrderBench(labOrderId: string) {
  const result = useApiQuery<LabOrderBenchView>({
    queryKey: getLabResultControllerGetOrderBenchV1QueryKey(labOrderId),
    queryFn: (signal) => labResultControllerGetOrderBenchV1(labOrderId, signal),
    errorMessage: 'Unable to load the laboratory order.',
  });

  return { ...result, bench: result.data };
}
