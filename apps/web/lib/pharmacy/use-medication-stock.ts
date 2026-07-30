import type { MedicationResponse, MedicationsListMeta } from '@hms/shared-types';

import {
  getMedicationControllerListMedicationsV1QueryKey,
  medicationControllerListMedicationsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { MedicationControllerListMedicationsV1Params } from '#lib/api/generated/model/medicationControllerListMedicationsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

const MEDICATION_STOCK_PARAMS: MedicationControllerListMedicationsV1Params = {
  page: 1,
  limit: 100,
};

export function useMedicationStock() {
  const query = useApiQuery<MedicationResponse[]>({
    queryKey: getMedicationControllerListMedicationsV1QueryKey(MEDICATION_STOCK_PARAMS),
    queryFn: (signal) => medicationControllerListMedicationsV1(MEDICATION_STOCK_PARAMS, signal),
    errorMessage: 'Failed to load medication stock',
  });

  return {
    ...query,
    medications: query.data ?? [],
    meta: query.meta as MedicationsListMeta | undefined,
  };
}
