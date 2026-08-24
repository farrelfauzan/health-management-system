import type { AdmissionResponse, AdmissionsListMeta } from '@hms/shared-types';

import {
  admissionFlowControllerListAdmissionsV1,
  getAdmissionFlowControllerListAdmissionsV1QueryKey,
} from '#lib/api/generated/admission-flow/admission-flow';
import type { AdmissionFlowControllerListAdmissionsV1Params } from '#lib/api/generated/model/admissionFlowControllerListAdmissionsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

export function useAdmissionsList(
  params: AdmissionFlowControllerListAdmissionsV1Params,
  isEnabled = true,
) {
  const query = useApiQuery<AdmissionResponse[]>({
    queryKey: getAdmissionFlowControllerListAdmissionsV1QueryKey(params),
    queryFn: (signal) => admissionFlowControllerListAdmissionsV1(params, signal),
    errorMessage: 'Failed to load admissions',
    enabled: isEnabled,
  });

  return {
    ...query,
    admissions: query.data ?? [],
    meta: query.meta as AdmissionsListMeta | undefined,
  };
}
