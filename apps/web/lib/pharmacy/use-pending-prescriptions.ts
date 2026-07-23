import type { PrescriptionResponse, PrescriptionsListMeta } from '@hms/shared-types';

import {
  getPrescriptionControllerListPrescriptionsV1QueryKey,
  prescriptionControllerListPrescriptionsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { PrescriptionControllerListPrescriptionsV1Params } from '#lib/api/generated/model/prescriptionControllerListPrescriptionsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { PharmacySearchParams } from '#lib/pharmacy/search-params';

// The queue lists ISSUED prescriptions only (same "pending" definition as the dashboard
// Pending RX stat): the list endpoint accepts a single status filter and the wire contract
// does not expose remaining quantities for PARTIALLY_DISPENSED rows yet.
const PENDING_PRESCRIPTION_STATUS = 'ISSUED' as const;

export function usePendingPrescriptions(params: PharmacySearchParams) {
  const requestParams: PrescriptionControllerListPrescriptionsV1Params = {
    page: params.page,
    limit: params.limit,
    status: PENDING_PRESCRIPTION_STATUS,
  };

  const query = useApiQuery<PrescriptionResponse[]>({
    queryKey: getPrescriptionControllerListPrescriptionsV1QueryKey(requestParams),
    queryFn: (signal) => prescriptionControllerListPrescriptionsV1(requestParams, signal),
    errorMessage: 'Failed to load pending prescriptions',
  });

  return {
    ...query,
    prescriptions: query.data ?? [],
    meta: query.meta as PrescriptionsListMeta | undefined,
  };
}
